/**
 * Request size tracking and limiting middleware.
 *
 * Provides per-route request body size limits beyond the global 100KB limit.
 * Tracks request sizes for monitoring and alerts on suspicious patterns.
 *
 * Use cases:
 *   - Avatar uploads: 2MB
 *   - Backup imports: 1MB
 *   - Config updates: 50KB
 *   - Webhook payloads: 500KB
 */

const logger = require('eb-bot-shared/lib/logger');

// Track request sizes for monitoring
const sizeStats = new Map();
const STATS_WINDOW = 5 * 60 * 1000; // 5 minutes

/**
 * Per-route request size limiter.
 *
 * @param {number} maxSize - Maximum size in bytes
 * @param {string} label - Label for logging (e.g. 'avatar', 'backup')
 */
function requestSizeLimit(maxSize, label = 'request') {
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'], 10);

        // If no content-length header, let express.json() handle it
        if (isNaN(contentLength)) {
            return next();
        }

        if (contentLength > maxSize) {
            logger.warn('Request body too large', {
                label,
                size: contentLength,
                maxSize,
                path: req.originalUrl,
                userId: req.session?.user?.id,
                requestId: req.requestId,
            });

            return res.status(413).json({
                error: `Request body too large for ${label}`,
                code: 'PAYLOAD_TOO_LARGE',
                maxSize,
            });
        }

        // Track size for monitoring
        trackRequestSize(label, contentLength);

        return next();
    };
}

/**
 * Track request sizes for monitoring.
 */
function trackRequestSize(label, size) {
    const now = Date.now();
    let stats = sizeStats.get(label);

    if (!stats || now - stats.windowStart > STATS_WINDOW) {
        stats = { windowStart: now, count: 0, totalSize: 0, maxSize: 0 };
        sizeStats.set(label, stats);
    }

    stats.count++;
    stats.totalSize += size;
    stats.maxSize = Math.max(stats.maxSize, size);
}

/**
 * Get request size statistics.
 */
function getSizeStats() {
    const now = Date.now();
    const result = {};

    for (const [label, stats] of sizeStats.entries()) {
        if (now - stats.windowStart <= STATS_WINDOW) {
            result[label] = {
                count: stats.count,
                avgSize: Math.round(stats.totalSize / stats.count),
                maxSize: stats.maxSize,
                totalSize: stats.totalSize,
            };
        }
    }

    return result;
}

/**
 * Middleware that logs request body size for debugging.
 */
function logRequestSize(req, res, next) {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (!isNaN(contentLength) && contentLength > 10000) { // Only log large requests
        logger.debug('Large request body', {
            size: contentLength,
            path: req.originalUrl,
            method: req.method,
        });
    }
    return next();
}

module.exports = {
    requestSizeLimit,
    getSizeStats,
    logRequestSize,
    // Pre-built limiters
    avatarUpload: () => requestSizeLimit(2 * 1024 * 1024, 'avatar'), // 2MB
    backupImport: () => requestSizeLimit(1024 * 1024, 'backup'), // 1MB
    configUpdate: () => requestSizeLimit(50 * 1024, 'config'), // 50KB
    webhookPayload: () => requestSizeLimit(512 * 1024, 'webhook'), // 500KB
};
