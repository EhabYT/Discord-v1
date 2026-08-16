/**
 * Per-endpoint rate limiting for expensive or abusable operations.
 *
 * The global limiter (400 req/min/IP in server.js) protects against crude
 * flooding, but it does not distinguish a cheap config read from an operation
 * that issues dozens of Discord API calls or scans the whole database. A single
 * authenticated Moderator can therefore still:
 *
 *   - exhaust the bot's Discord rate limit budget (mass kick, panel spam),
 *     which degrades the bot for every guild it serves, not just theirs;
 *   - force repeated full-table scans (db.all()) on the shared SQLite file;
 *   - fan out messages through the bot as a spam relay.
 *
 * These limits are keyed per user (falling back to IP for the localhost dev
 * bypass) and per limiter name, so one guild's abuse cannot consume another's
 * allowance and a burst on one endpoint does not lock out unrelated ones.
 */

const buckets = new Map();

// Drop expired buckets so an attacker cycling identities cannot grow the map
// without bound. Unref'd so it never keeps the process alive on its own.
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets.entries()) {
        if (now > b.resetAt + 60_000) buckets.delete(key);
    }
}, 5 * 60 * 1000);
if (typeof sweeper.unref === 'function') sweeper.unref();

function identify(req) {
    const uid = req.session?.user?.id;
    if (uid) return `u:${uid}`;
    const fwd = req.headers['x-forwarded-for'];
    const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null)
        || req.socket?.remoteAddress || 'unknown';
    return `ip:${ip}`;
}

/**
 * @param {string} name    limiter identity, e.g. 'bulk-moderation'
 * @param {number} max     allowed operations per window
 * @param {number} windowMs
 */
function limit(name, max, windowMs) {
    return (req, res, next) => {
        const key = `${name}:${identify(req)}`;
        const now = Date.now();
        let b = buckets.get(key);
        if (!b || now > b.resetAt) {
            b = { count: 0, resetAt: now + windowMs };
            buckets.set(key, b);
        }
        b.count += 1;
        if (b.count > max) {
            const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Too many requests for this operation — slow down',
                code: 'RATE_LIMITED',
                retryAfter,
            });
        }
        return next();
    };
}

module.exports = {
    limit,
    /** Mass Discord actions: kick sweeps, bulk deletes. */
    bulkModeration: () => limit('bulk-moderation', 3, 5 * 60 * 1000),
    /** Anything that makes the bot post into a channel. */
    botMessaging: () => limit('bot-messaging', 20, 60 * 1000),
    /** Full-table scans and config exports. */
    heavyRead: () => limit('heavy-read', 10, 60 * 1000),
    /** Writes that replace large amounts of stored state. */
    restore: () => limit('restore', 3, 10 * 60 * 1000),
    _buckets: buckets,
};
