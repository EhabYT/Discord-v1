'use strict';

const buckets = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 400;

function rateLimiter(req, res, next) {
    if (req.path === '/api/health' || req.path === '/api/auth/status') return next();
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.socket.remoteAddress;
    const now = Date.now();
    const bucket = buckets.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > bucket.resetAt) {
        bucket.count = 1;
        bucket.resetAt = now + WINDOW_MS;
    } else {
        bucket.count += 1;
    }
    buckets.set(ip, bucket);
    if (bucket.count > MAX_REQUESTS) return res.status(429).json({ error: 'Slow down' });
    next();
}

const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of buckets) {
        if (now > bucket.resetAt + (30 * 60 * 1000)) buckets.delete(ip);
    }
}, 15 * 60 * 1000);
cleanup.unref();

module.exports = { rateLimiter };
