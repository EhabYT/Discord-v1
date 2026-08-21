const crypto = require('crypto');
const { isLoopback } = require('./auth');
const { recordDeveloperAction } = require('../../../shared/services/developer-audit');

const SECRET_KEYS = /token|secret|password|passwd|private|credential|api[_-]?key|client_secret|jwt|database_url/i;
const SYSTEM_ROLES = Object.freeze({ NONE: 0, SUPPORT: 1, DEVELOPER: 2, SUPER_ADMIN: 3 });
const ROLE_NAMES = ['NONE', 'SUPPORT', 'DEVELOPER', 'SUPER_ADMIN'];

function csvIds(name) {
    return new Set(String(process.env[name] || '').split(',').map((id) => id.trim()).filter(Boolean));
}

function ownerIds(botClient) {
    const ids = new Set();
    if (process.env.OWNER_ID) ids.add(String(process.env.OWNER_ID));
    try {
        const app = botClient?.application;
        const oid = app?.owner?.id || app?.owner?.ownerId || app?.owner?.user?.id;
        if (oid) ids.add(String(oid));
    } catch { /* ignore */ }
    return ids;
}

function isOwnerSession(req, botClient) {
    const uid = req.session?.user?.id;
    return !!uid && ownerIds(botClient).has(String(uid));
}

function baseSystemRole(req, botClient) {
    const uid = String(req.session?.user?.id || '');
    if (!uid) return SYSTEM_ROLES.NONE;
    if (ownerIds(botClient).has(uid)) return SYSTEM_ROLES.SUPER_ADMIN;
    if (csvIds('DEVELOPER_IDS').has(uid)) return SYSTEM_ROLES.DEVELOPER;
    if (csvIds('SUPPORT_IDS').has(uid)) return SYSTEM_ROLES.SUPPORT;
    return SYSTEM_ROLES.NONE;
}

function tokenOk(raw) {
    const expected = String(process.env.DEV_TOKEN || '');
    if (expected.length < 32 || !raw) return false;
    const a = Buffer.from(String(raw));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function systemRole(req, botClient) {
    const base = baseSystemRole(req, botClient);
    if (base === SYSTEM_ROLES.SUPER_ADMIN || base === SYSTEM_ROLES.SUPPORT) return base;
    if (base === SYSTEM_ROLES.DEVELOPER && req.session?.devUnlocked === true) return base;
    // Local development can bootstrap with DEV_TOKEN without Discord OAuth.
    if (process.env.NODE_ENV !== 'production' && req.session?.devUnlocked === true && isLoopback(req)) {
        return SYSTEM_ROLES.DEVELOPER;
    }
    return SYSTEM_ROLES.NONE;
}

function isDev(req, botClient) {
    return systemRole(req, botClient) >= SYSTEM_ROLES.DEVELOPER;
}

function requireSystemRole(botClient, minimum = SYSTEM_ROLES.DEVELOPER) {
    return (req, res, next) => {
        const role = systemRole(req, botClient);
        if (role >= minimum) {
            req.systemRole = ROLE_NAMES[role];
            return next();
        }
        req.systemRole = ROLE_NAMES[role];
        if (req.session?.user?.id) {
            recordDeveloperAction(req, 'authorization.denied', req.originalUrl, 'denied', {
                required: ROLE_NAMES[minimum], yours: ROLE_NAMES[role],
            });
        }
        return res.status(403).json({
            error: 'Insufficient system access',
            code: 'SYSTEM_ROLE_REQUIRED',
            required: ROLE_NAMES[minimum],
            yours: ROLE_NAMES[role],
        });
    };
}

function requireDev(botClient) {
    return requireSystemRole(botClient, SYSTEM_ROLES.DEVELOPER);
}

function redactEnv() {
    const out = [];
    for (const [key, value] of Object.entries(process.env)) {
        if (!/^[A-Z][A-Z0-9_]+$/.test(key)) continue;
        const secret = SECRET_KEYS.test(key);
        out.push({
            key,
            set: value != null && String(value).length > 0,
            secret,
            // Never return even a suffix of secret values to the browser.
            preview: secret ? '' : String(value).slice(0, 80),
        });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
}

module.exports = {
    SYSTEM_ROLES, ROLE_NAMES,
    requireDev, requireSystemRole, isDev, systemRole, baseSystemRole,
    isOwnerSession, tokenOk, redactEnv, ownerIds,
};
