const crypto = require('crypto');

const SECRET_KEYS = /token|secret|password|passwd|private|credential|api[_-]?key|client_secret|jwt/i;

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
    if (!uid) return false;
    return ownerIds(botClient).has(String(uid));
}

function tokenOk(raw) {
    const expected = process.env.DEV_TOKEN || '';
    if (!expected || !raw) return false;
    const a = Buffer.from(String(raw));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function isDev(req, botClient) {
    if (req.session?.devUnlocked === true) return true;
    if (isOwnerSession(req, botClient)) return true;
    const header = req.headers['x-dev-token'];
    if (tokenOk(header)) return true;
    return false;
}

function requireDev(botClient) {
    return (req, res, next) => {
        if (isDev(req, botClient)) return next();
        return res.status(403).json({ error: 'Developer only', code: 'DEV_FORBIDDEN' });
    };
}

function redactEnv() {
    const out = [];
    for (const [k, v] of Object.entries(process.env)) {
        if (!/^[A-Z][A-Z0-9_]+$/.test(k)) continue;
        const secret = SECRET_KEYS.test(k);
        out.push({
            key: k,
            set: v != null && String(v).length > 0,
            secret,
            preview: secret ? (v ? `••••${String(v).slice(-4)}` : '') : String(v).slice(0, 80),
        });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
}

module.exports = { requireDev, isDev, isOwnerSession, tokenOk, redactEnv, ownerIds };
