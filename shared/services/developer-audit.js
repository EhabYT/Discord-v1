const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'developer-audit.log');
const SECRET_FIELD = /token|secret|password|credential|database.?url|authorization/i;

// Phase 6: audit writes no longer block the request event loop. Recording a
// developer action used to perform mkdir + append + chmod synchronously on
// every call — three blocking filesystem syscalls inside authenticated request
// handlers. Events are now batched in memory and appended asynchronously in a
// single write; `readDeveloperAudit` and graceful shutdown flush the pending
// batch synchronously first, so write-then-read stays consistent and the
// trailing batch is never lost on SIGTERM/SIGINT.
const FLUSH_DELAY_MS = 250;
const MAX_PENDING_LINES = 2000;
let pendingLines = [];
let flushTimer = null;
let dirReady = false;

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

function ensureDir() {
    if (dirReady) return true;
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        dirReady = true;
        return true;
    } catch {
        return false;
    }
}

function requeue(payload) {
    const lines = payload.split('\n').filter(Boolean).map((line) => `${line}\n`);
    pendingLines = [...lines.slice(-MAX_PENDING_LINES), ...pendingLines].slice(-MAX_PENDING_LINES);
}

function flushPendingAsync() {
    if (pendingLines.length === 0) return;
    // Ephemeral filesystem unavailable: keep the batch queued and retry on the
    // next record instead of dropping audit context.
    if (!ensureDir()) return;
    const payload = pendingLines.join('');
    pendingLines = [];
    fs.appendFile(AUDIT_FILE, payload, { mode: 0o600 }, (err) => {
        if (err) {
            requeue(payload);
            return;
        }
        try { fs.chmod(AUDIT_FILE, 0o600, () => {}); } catch { /* non-POSIX */ }
    });
}

function scheduleFlush() {
    if (flushTimer || pendingLines.length === 0) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushPendingAsync();
    }, FLUSH_DELAY_MS);
    // Never hold the process (or a test runner) open for the audit batch.
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

/**
 * Synchronously persist every queued audit line. Called before reads and
 * during graceful shutdown. Returns true when the queue is empty or was
 * flushed; false only when the filesystem is unavailable (the batch stays
 * queued for a later retry).
 */
function flushDeveloperAudit() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (pendingLines.length === 0) return true;
    if (!ensureDir()) return false;
    const payload = pendingLines.join('');
    pendingLines = [];
    try {
        fs.appendFileSync(AUDIT_FILE, payload, { mode: 0o600 });
        try { fs.chmodSync(AUDIT_FILE, 0o600); } catch { /* non-POSIX */ }
        return true;
    } catch {
        requeue(payload);
        return false;
    }
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
    // Non-blocking: the event is returned synchronously for callers, while the
    // filesystem write is batched. Auditing can no longer slow down — or fail
    // — the protected operation when the disk stalls.
    pendingLines.push(`${JSON.stringify(event)}\n`);
    if (pendingLines.length > MAX_PENDING_LINES) {
        pendingLines = pendingLines.slice(-MAX_PENDING_LINES);
    }
    scheduleFlush();
    return event;
}

function readDeveloperAudit({ limit = 100, action = '', result = '' } = {}) {
    // Flush first so a record-then-read sequence observes its own writes.
    flushDeveloperAudit();
    let raw = '';
    try { raw = fs.readFileSync(AUDIT_FILE, 'utf8'); } catch { return []; }
    const rows = raw.split(/\r?\n/).filter(Boolean).slice(-2000).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse();
    return rows.filter((row) => (!action || row.action.includes(action)) && (!result || row.result === result))
        .slice(0, Math.min(500, Math.max(1, Number(limit) || 100)));
}

module.exports = { recordDeveloperAction, readDeveloperAudit, flushDeveloperAudit, safeObject, AUDIT_FILE };
