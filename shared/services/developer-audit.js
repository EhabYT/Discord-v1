const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'developer-audit.log');
const SECRET_FIELD = /token|secret|password|credential|database.?url|authorization/i;

function safeObject(value) {
    if (!value || typeof value !== 'object') return {};
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (SECRET_FIELD.test(key)) out[key] = '[REDACTED]';
        else if (typeof item === 'string') out[key] = item.replace(/[\r\n\0]/g, ' ').slice(0, 200);
        else if (['number', 'boolean'].includes(typeof item) || item == null) out[key] = item;
    }
    return out;
}

function recordDeveloperAction(req, action, target, result = 'success', metadata = {}) {
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
        || req.socket?.remoteAddress || null;
    const event = {
        timestamp: new Date().toISOString(),
        requestId: req.requestId || null,
        userId: req.session?.user?.id || null,
        systemRole: req.systemRole || null,
        action: String(action).slice(0, 100),
        target: String(target || 'system').slice(0, 120),
        result,
        ip,
        metadata: safeObject(metadata),
    };
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(event)}\n`, { mode: 0o600 });
        try { fs.chmodSync(AUDIT_FILE, 0o600); } catch { /* non-POSIX */ }
        return event;
    } catch {
        // Auditing must never make the protected operation fail because the
        // ephemeral filesystem is temporarily unavailable.
        return null;
    }
}

function readDeveloperAudit({ limit = 100, action = '', result = '' } = {}) {
    let raw = '';
    try { raw = fs.readFileSync(AUDIT_FILE, 'utf8'); } catch { return []; }
    const rows = raw.split(/\r?\n/).filter(Boolean).slice(-2000).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse();
    return rows.filter((row) => (!action || row.action.includes(action)) && (!result || row.result === result))
        .slice(0, Math.min(500, Math.max(1, Number(limit) || 100)));
}

module.exports = { recordDeveloperAction, readDeveloperAudit, safeObject, AUDIT_FILE };
