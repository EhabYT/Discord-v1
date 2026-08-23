const express = require('express');
const crypto = require('crypto');
const { getAccountStore, normalizeUsername } = require('../../../database/accounts');
const { getPool } = require('../../../database/index');
const { validatePassword, hashPassword, verifyPassword } = require('../../../shared/services/passwords');

const RESERVED = new Set(['admin', 'administrator', 'support', 'system', 'discord', 'ebbot', 'root', 'login', 'register', 'security']);
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
    const displayName = String(body?.displayName || '').normalize('NFKC').trim();
    const username = String(body?.username || '').normalize('NFKC').trim().toLowerCase();
    const email = String(body?.email || '').normalize('NFKC').trim().toLowerCase();
    if (displayName.length < 1 || displayName.length > 64) return { error: 'Display name must be 1–64 characters' };
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) return { error: 'Username must be 3–24 letters, numbers, or underscores and start with a letter' };
    if (RESERVED.has(username)) return { error: 'That username is reserved' };
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address' };
    const passwordIssue = validatePassword(body?.password);
    if (passwordIssue) return { error: passwordIssue };
    if (body.password !== body.confirmPassword) return { error: 'Passwords do not match' };
    return { displayName, username: normalizeUsername(username), email };
}

function regenerate(req) {
    return new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
}
function save(req) {
    return new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}
function attachLocalAccount(session, account) {
    session.account = account;
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
            await save(req);
            return res.status(201).json({ account, verificationRequired: true });
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
            attachLocalAccount(req.session, credential.account);
            await save(req);
            return res.json({ account: credential.account, verificationRequired: !credential.account.emailVerified });
        } catch (err) { return next(err); }
    });

    return router;
};

module.exports.validateRegistration = validateRegistration;
