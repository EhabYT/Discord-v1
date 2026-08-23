const express = require('express');
const multer = require('multer');
const { getAccountStore } = require('../../../database/accounts');
const { getPool } = require('../../../database/index');
const { requireAccount } = require('../middleware/auth');
const { normalizeDisplayName, normalizeLocalUsername, normalizeEmail } = require('../../../shared/services/account-validation');
const { verifyPassword } = require('../../../shared/services/passwords');
const { sendEmailChangeVerification } = require('../../../shared/services/account-mail');
const { normalizeAvatar, uploadAvatar, deleteAvatar } = require('../../../shared/services/account-avatars');
const logger = require('../../../shared/lib/logger');

const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => callback(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});

function saveSession(session) {
    return new Promise((resolve, reject) => {
        session.save(err => err ? reject(err) : resolve());
    });
}

function attachAccount(session, account) {
    session.account = account;
}

module.exports = () => {
    const router = express.Router();

    // Stage A exposes one read-only projection. Existing Discord sessions are
    // lazily upgraded so a deployment does not force every operator to log out.
    router.get('/', async (req, res, next) => {
        try {
            if (!req.session.account && !req.session.user) {
                return res.status(401).json({ error: 'Not authenticated', code: 'ACCOUNT_AUTH_REQUIRED' });
            }
            if (!req.session.account) {
                if (!getPool()) {
                    return res.status(503).json({
                        error: 'Account storage is unavailable',
                        code: 'ACCOUNT_STORAGE_UNAVAILABLE',
                    });
                }
                const account = await getAccountStore().ensureDiscordAccount(
                    req.session.user,
                    req.requestId
                );
                attachAccount(req.session, account);
                await saveSession(req.session);
            }
            return res.json({
                account: req.session.account,
                discord: req.session.user ? {
                    id: req.session.user.id,
                    username: req.session.user.username,
                    tag: req.session.user.tag,
                    avatar: req.session.user.avatar,
                } : null,
            });
        } catch (err) {
            return next(err);
        }
    });

    router.patch('/profile', requireAccount, async (req, res, next) => {
        try {
            const displayName = normalizeDisplayName(req.body?.displayName);
            const username = normalizeLocalUsername(req.body?.username);
            if (!displayName || !username) {
                return res.status(400).json({ error: 'Enter a valid display name and username', code: 'VALIDATION_ERROR' });
            }
            const store = getAccountStore();
            const rate = await store.consumeAuthLimit(`profile-change:${req.accountId}`, {
                max: 10, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000,
            });
            if (!rate.allowed) return res.status(429).json({ error: 'Too many profile changes', code: 'RATE_LIMITED' });
            let result;
            try { result = await store.updateProfile(req.accountId, { displayName, username }); }
            catch (err) {
                if (err.code === '23505') return res.status(409).json({ error: 'That username is unavailable', code: 'USERNAME_UNAVAILABLE' });
                throw err;
            }
            if (result.usernameCooldown) return res.status(429).json({ error: 'Username can be changed once every 30 days', code: 'USERNAME_COOLDOWN' });
            attachAccount(req.session, result.account);
            await saveSession(req.session);
            return res.json({ account: result.account });
        } catch (err) { return next(err); }
    });

    router.post('/email/change', requireAccount, async (req, res, next) => {
        try {
            const newEmail = normalizeEmail(req.body?.email);
            const currentPassword = String(req.body?.currentPassword || '');
            if (!newEmail || !currentPassword) return res.status(400).json({ error: 'New email and current password are required', code: 'VALIDATION_ERROR' });
            const store = getAccountStore();
            const rate = await store.consumeAuthLimit(`email-change:${req.accountId}`, {
                max: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000,
            });
            if (!rate.allowed) return res.status(429).json({ error: 'Too many email change attempts', code: 'RATE_LIMITED' });
            const passwordHash = await store.credentialByAccount(req.accountId);
            if (!passwordHash || !await verifyPassword(passwordHash, currentPassword)) {
                return res.status(401).json({ error: 'Reauthentication failed', code: 'REAUTH_FAILED' });
            }
            const current = await store.byId(req.accountId);
            if (current.email?.toLowerCase() === newEmail) return res.status(400).json({ error: 'Enter a different email address', code: 'VALIDATION_ERROR' });
            if (await store.byEmail(newEmail)) return res.status(409).json({ error: 'Unable to use that email address', code: 'EMAIL_UNAVAILABLE' });
            const token = await store.issueEmailToken(req.accountId, 'verify_email', 24 * 60 * 60 * 1000, newEmail);
            const delivery = await sendEmailChangeVerification(current, newEmail, token);
            return res.json({ success: true, verificationEmailSent: delivery.sent, message: 'Verify the new address before it replaces your current email.' });
        } catch (err) { return next(err); }
    });

    router.post('/avatar', requireAccount, (req, res, next) => {
        avatarUpload.single('avatar')(req, res, async uploadError => {
            if (uploadError) {
                const tooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
                return res.status(400).json({ error: tooLarge ? 'Avatar must be at most 2 MiB' : 'Invalid avatar upload', code: 'AVATAR_INVALID' });
            }
            try {
                if (!req.file) return res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP image', code: 'AVATAR_INVALID' });
                const store = getAccountStore();
                const rate = await store.consumeAuthLimit(`avatar-change:${req.accountId}`, {
                    max: 10, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000,
                });
                if (!rate.allowed) return res.status(429).json({ error: 'Too many avatar changes', code: 'RATE_LIMITED' });
                const normalized = await normalizeAvatar(req.file.buffer);
                const previousKey = await store.avatarKey(req.accountId);
                const uploaded = await uploadAvatar(req.accountId, normalized);
                const account = await store.setAvatar(req.accountId, uploaded.objectKey, uploaded.publicUrl);
                attachAccount(req.session, account);
                await saveSession(req.session);
                if (previousKey) deleteAvatar(previousKey).catch(err => logger.warn('Previous avatar cleanup failed', { error: err.message }));
                return res.json({ account });
            } catch (err) {
                if (err.code === 'AVATAR_INVALID' || err.code === 'AVATAR_STORAGE_UNAVAILABLE') {
                    return res.status(err.code === 'AVATAR_INVALID' ? 400 : 503).json({ error: err.message, code: err.code });
                }
                return next(err);
            }
        });
    });

    router.delete('/avatar', requireAccount, async (req, res, next) => {
        try {
            const store = getAccountStore();
            const previousKey = await store.avatarKey(req.accountId);
            const account = await store.setAvatar(req.accountId, null, null);
            attachAccount(req.session, account);
            await saveSession(req.session);
            if (previousKey) deleteAvatar(previousKey).catch(err => logger.warn('Avatar cleanup failed', { error: err.message }));
            return res.json({ account });
        } catch (err) { return next(err); }
    });

    return router;
};
