/**
 * IP-Based Auth Blocking
 *
 * Tracks failed authentication attempts per IP and temporarily blocks
 * IPs that exceed the threshold to prevent brute force attacks.
 */

const logger = require('../../../shared/lib/logger');

const failedAttempts = new Map();
const blockedIPs = new Map();

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let cleanupTimer = null;

function startCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const now = Date.now();

        for (const [ip, blockedUntil] of blockedIPs) {
            if (now > blockedUntil) blockedIPs.delete(ip);
        }

        for (const [ip, attempts] of failedAttempts) {
            const recent = attempts.filter((ts) => now - ts < WINDOW_MS);
            if (recent.length === 0) failedAttempts.delete(ip);
            else failedAttempts.set(ip, recent);
        }
    }, CLEANUP_INTERVAL_MS);
    if (cleanupTimer.unref) cleanupTimer.unref();
}

function getRealIP(req) {
    return req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || req.connection?.remoteAddress
        || 'unknown';
}

function isIPBlocked(ip) {
    const blockedUntil = blockedIPs.get(ip);
    if (!blockedUntil) return false;
    if (Date.now() > blockedUntil) {
        blockedIPs.delete(ip);
        return false;
    }
    return true;
}

function recordFailedAttempt(ip) {
    if (!failedAttempts.has(ip)) failedAttempts.set(ip, []);
    const attempts = failedAttempts.get(ip);
    attempts.push(Date.now());

    const recent = attempts.filter((ts) => Date.now() - ts < WINDOW_MS);
    failedAttempts.set(ip, recent);

    if (recent.length >= MAX_ATTEMPTS) {
        blockedIPs.set(ip, Date.now() + BLOCK_DURATION_MS);
        logger.warn(`IP blocked due to repeated auth failures`, {
            ip,
            attempts: recent.length,
            blockDuration: BLOCK_DURATION_MS / 1000 / 60,
        });
        return true;
    }

    return false;
}

function recordSuccessfulAuth(ip) {
    failedAttempts.delete(ip);
}

function getStats() {
    return {
        blockedIPs: blockedIPs.size,
        trackedIPs: failedAttempts.size,
    };
}

function reset() {
    failedAttempts.clear();
    blockedIPs.clear();
}

startCleanup();

module.exports = {
    getRealIP,
    isIPBlocked,
    recordFailedAttempt,
    recordSuccessfulAuth,
    getStats,
    reset,
};
