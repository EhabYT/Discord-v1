const express = require('express');
const crypto = require('crypto');
const { getAccountStore } = require('eb-bot-database/accounts');
const { getPool } = require('eb-bot-database');
const { validatePassword, hashPassword, verifyPassword } = require('eb-bot-shared/services/passwords');
const {
    sendVerificationEmail, sendEmailChangedNotice, sendPasswordResetEmail,
} = require('eb-bot-shared/services/account-mail');
const logger = require('eb-bot-shared/lib/logger');
const { attachSessionSecurity } = require('eb-bot-shared/services/account-sessions');
const { decryptSecret, verifyTotp, recoveryHash } = require('eb-bot-shared/services/account-mfa');
const { normalizeDisplayName, normalizeLocalUsername, normalizeEmail } = require('eb-bot-shared/services/account-validation');
// Unknown accounts still perform one Argon2 verification to reduce timing-based
// account enumeration. This value is never an account credential.
const dummyHashPromise = hashPassword('not a real account password value');

function bucket(value) {
    return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
        || req.socket?.remoteAddress || 'unknown';
}

function validateRegistration(body) {
    const displayName = normalizeDisplayName(body?.displayName);
    const username = normalizeLocalUsername(body?.username);
    const email = normalizeEmail(body?.email);
    if (!displayName) return { error: 'Display name must be 1–64 characters' };
    if (!username) return { error: 'Username must be 3–24 letters, numbers, or underscores, start with a letter, and not be reserved' };
    if (!email) return { error: 'Enter a valid email address' };
    const passwordIssue = validatePassword(body?.password);
    if (passwordIssue) return { error: passwordIssue };
    if (body.password !== body.confirmPassword) return { error: 'Passwords do not match' };
    return { displayName, username, email };
}

function regenerate(req) {
    return new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
}
function save(req) {
    return new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}
function attachAccount(session, account) {
    session.account = account;
}
function attachMfaChallenge(session, accountId) {
    session.mfaChallenge = { accountId, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
}
function incrementMfaAttempts(challenge) {
    challenge.attempts = Number(challenge.attempts || 0) + 1;
}
function attachDiscordAccount(session, account, pendingDiscord) {
    attachAccount(session, account);
    session.user = pendingDiscord.user;
    session.userGuilds = pendingDiscord.userGuilds;
    delete session.devUnlocked;
}
function attachLocalAccount(session, account) {
    attachAccount(session, account);
    delete session.user;
    delete session.userGuilds;
    delete session.devUnlocked;
}

module.exports = () => {
    const router = express.Router();

    router.post('/register', async (req, res, next) => {
        try {
            if (!getPool()) return res.status(503).json({ error: 'Account storage is unavailable', code: 'ACCOUNT_STORAGE_UNAVAILABLE' });
            const input = validateRegistration(req.body);
            if (input.error) return res.status(400).json({ error: input.error, code: 'VALIDATION_ERROR' });
            const store = getAccountStore();
            const rate = await store.consumeAuthLimit(`register:ip:${bucket(clientIp(req))}`, {
                max: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000,
            });
            if (!rate.allowed) {
                res.setHeader('Retry-After', String(rate.retryAfter));
                return res.status(429).json({ error: 'Too many registration attempts', code: 'RATE_LIMITED' });
            }
            const passwordHash = await hashPassword(req.body.password);
            let account;
            try {
                account = await store.createLocalAccount({ ...input, passwordHash }, req.requestId);
            } catch (err) {
                if (err.code === '23505') {
                    return res.status(409).json({
                        error: 'Unable to create an account with those details',
                        code: 'ACCOUNT_CONFLICT',
                    });
                }
                throw err;
            }
            await regenerate(req);
            attachLocalAccount(req.session, account);
            attachSessionSecurity(req.session, req);
            await save(req);
            let verificationEmailSent = false;
            try {
                const token = await store.issueEmailToken(account.id, 'verify_email', 24 * 60 * 60 * 1000);
                verificationEmailSent = (await sendVerificationEmail(account, token)).sent;
            } catch (err) {
                logger.warn('Account verification email could not be delivered', { error: err.message, requestId: req.requestId });
            }
            return res.status(201).json({ account, verificationRequired: true, verificationEmailSent });
        } catch (err) { return next(err); }
    });

    router.post('/login', async (req, res, next) => {
        try {
            if (!getPool()) return res.status(503).json({ error: 'Account storage is unavailable', code: 'ACCOUNT_STORAGE_UNAVAILABLE' });
            const identifier = String(req.body?.identifier || '').normalize('NFKC').trim().toLowerCase().slice(0, 254);
            const password = String(req.body?.password || '');
            if (!identifier || !password) return res.status(400).json({ error: 'Email/username and password are required', code: 'VALIDATION_ERROR' });
            const store = getAccountStore();
            const limits = await Promise.all([
                store.consumeAuthLimit(`login:ip:${bucket(clientIp(req))}`, { max: 20, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 }),
                store.consumeAuthLimit(`login:id:${bucket(identifier)}`, { max: 8, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 }),
            ]);
            const denied = limits.find(result => !result.allowed);
            if (denied) {
                res.setHeader('Retry-After', String(denied.retryAfter));
                return res.status(429).json({ error: 'Too many login attempts', code: 'RATE_LIMITED' });
            }
            const credential = await store.credentialByLogin(identifier);
            const valid = await verifyPassword(credential?.passwordHash || await dummyHashPromise, password);
            if (!credential || !valid || credential.account.status !== 'active') {
                return res.status(401).json({ error: 'Invalid email/username or password', code: 'INVALID_CREDENTIALS' });
            }
            await regenerate(req);
            if (credential.account.mfaEnabled) {
                attachMfaChallenge(req.session, credential.account.id);
                await save(req);
                return res.status(202).json({ mfaRequired: true, challengeExpiresIn: 300 });
            }
            attachLocalAccount(req.session, credential.account);
            attachSessionSecurity(req.session, req);
            await save(req);
            await store.recordSecurityEvent(credential.account.id, 'login_success', req.requestId, { method: 'password' });
            return res.json({ account: credential.account, verificationRequired: !credential.account.emailVerified });
        } catch (err) { return next(err); }
    });

    router.post('/mfa/verify', async (req, res, next) => {
        try {
            const challenge = req.session?.mfaChallenge;
            if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
                return res.status(401).json({ error: 'MFA challenge expired', code: 'MFA_CHALLENGE_EXPIRED' });
            }
            const factor = String(req.body?.code || '').trim();
            const store = getAccountStore();
            const rate = await store.consumeAuthLimit(`mfa-login:${challenge.accountId}`, {
                max: 8, windowMs: 5 * 60 * 1000, blockMs: 15 * 60 * 1000,
            });
            if (!rate.allowed) return res.status(429).json({ error: 'Too many MFA attempts', code: 'RATE_LIMITED' });
            let valid = false;
            if (/^EB-/i.test(factor)) {
                valid = await store.consumeRecoveryCode(challenge.accountId, recoveryHash(factor));
            } else {
                const record = await store.mfaRecord(challenge.accountId);
                if (record) {
                    const step = verifyTotp(decryptSecret(record), factor);
                    valid = step != null && await store.claimTotpStep(challenge.accountId, step);
                }
            }
            if (!valid) {
                incrementMfaAttempts(challenge);
                await save(req);
                return res.status(401).json({ error: 'Invalid authentication code', code: 'INVALID_MFA_CODE' });
            }
            const account = await store.byId(challenge.accountId);
            const pendingDiscord = challenge.pendingDiscord || null;
            await regenerate(req);
            if (pendingDiscord) attachDiscordAccount(req.session, account, pendingDiscord);
            else attachLocalAccount(req.session, account);
            attachSessionSecurity(req.session, req);
            await save(req);
            await store.recordSecurityEvent(account.id, 'login_success', req.requestId, { method: pendingDiscord ? 'discord_mfa' : 'password_mfa' });
            return res.json({ account, verificationRequired: !account.emailVerified });
        } catch (err) {
            if (err.code === 'MFA_UNAVAILABLE') return res.status(503).json({ error: 'MFA verification is unavailable', code: err.code });
            return next(err);
        }
    });

    router.post('/resend-verification', async (req, res, next) => {
        try {
            const accountId = req.session?.account?.id;
            if (!accountId) return res.status(401).json({ error: 'Not authenticated', code: 'ACCOUNT_AUTH_REQUIRED' });
            const store = getAccountStore();
            const rate = await store.consumeAuthLimit(`verify-resend:${accountId}`, {
                max: 3, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000,
            });
            if (!rate.allowed) {
                res.setHeader('Retry-After', String(rate.retryAfter));
                return res.status(429).json({ error: 'Too many verification emails requested', code: 'RATE_LIMITED' });
            }
            const account = await store.byId(accountId);
            if (account?.email && !account.emailVerified) {
                const token = await store.issueEmailToken(account.id, 'verify_email', 24 * 60 * 60 * 1000);
                await sendVerificationEmail(account, token);
            }
            return res.json({ success: true, message: 'If verification is still required, a new email has been requested.' });
        } catch (err) { return next(err); }
    });

    router.post('/verify-email', async (req, res, next) => {
        try {
            const token = String(req.body?.token || '');
            if (token.length < 32 || token.length > 200) return res.status(400).json({ error: 'Invalid or expired verification link', code: 'INVALID_TOKEN' });
            const verified = await getAccountStore().verifyEmailToken(token, req.requestId);
            if (!verified) return res.status(400).json({ error: 'Invalid or expired verification link', code: 'INVALID_TOKEN' });
            if (req.session?.account?.id === verified.account.id) {
                attachAccount(req.session, verified.account);
                await save(req);
            }
            if (verified.emailChanged && verified.oldEmail) {
                sendEmailChangedNotice(verified.oldEmail, verified.account).catch(err => {
                    logger.warn('Old-address email change notice failed', { error: err.message, requestId: req.requestId });
                });
            }
            return res.json({ success: true, account: verified.account, emailChanged: verified.emailChanged });
        } catch (err) { return next(err); }
    });

    router.post('/forgot-password', async (req, res, next) => {
        const generic = { success: true, message: 'If that verified account exists, a password reset email has been requested.' };
        try {
            if (!getPool()) return res.json(generic);
            const email = String(req.body?.email || '').normalize('NFKC').trim().toLowerCase().slice(0, 254);
            const store = getAccountStore();
            const limits = await Promise.all([
                store.consumeAuthLimit(`forgot:ip:${bucket(clientIp(req))}`, { max: 10, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 }),
                store.consumeAuthLimit(`forgot:id:${bucket(email)}`, { max: 3, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 }),
            ]);
            if (limits.some(result => !result.allowed)) return res.json(generic);
            const account = email ? await store.byEmail(email) : null;
            if (account?.emailVerified && account.status === 'active') {
                const token = await store.issueEmailToken(account.id, 'reset_password', 30 * 60 * 1000);
                await sendPasswordResetEmail(account, token);
            }
            return res.json(generic);
        } catch (err) {
            logger.warn('Password reset request could not be processed', { error: err.message, requestId: req.requestId });
            return res.json(generic);
        }
    });

    router.post('/reset-password', async (req, res, next) => {
        try {
            if (!getPool()) return res.status(503).json({ error: 'Account storage is unavailable', code: 'ACCOUNT_STORAGE_UNAVAILABLE' });
            const token = String(req.body?.token || '');
            if (token.length < 32 || token.length > 200) return res.status(400).json({ error: 'Invalid or expired reset link', code: 'INVALID_TOKEN' });
            const issue = validatePassword(req.body?.password);
            if (issue) return res.status(400).json({ error: issue, code: 'PASSWORD_POLICY' });
            if (req.body.password !== req.body.confirmPassword) return res.status(400).json({ error: 'Passwords do not match', code: 'VALIDATION_ERROR' });
            const rate = await getAccountStore().consumeAuthLimit(`reset:token:${bucket(token)}`, {
                max: 8, windowMs: 30 * 60 * 1000, blockMs: 30 * 60 * 1000,
            });
            if (!rate.allowed) return res.status(400).json({ error: 'Invalid or expired reset link', code: 'INVALID_TOKEN' });
            const passwordHash = await hashPassword(req.body.password);
            const changed = await getAccountStore().resetPasswordWithToken(token, passwordHash, req.requestId);
            if (!changed) return res.status(400).json({ error: 'Invalid or expired reset link', code: 'INVALID_TOKEN' });
            req.session.destroy(() => res.json({ success: true, sessionsRevoked: true }));
        } catch (err) { return next(err); }
    });

    return router;
};

module.exports.validateRegistration = validateRegistration;
