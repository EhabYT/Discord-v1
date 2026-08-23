const express = require('express');
const { getAccountStore } = require('../../../database/accounts');
const { getPool } = require('../../../database/index');

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

    return router;
};
