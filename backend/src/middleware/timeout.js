/**
 * Request timeout middleware.
 *
 * Prevents requests from hanging indefinitely, which can:
 *   - Exhaust server resources (connection slots, memory)
 *   - Be used for denial-of-service attacks
 *   - Cause cascading failures when downstream services are slow
 *
 * Sets a timeout on each request and returns 408 if the handler doesn't
 * complete in time. SSE/WebSocket connections are excluded since they
 * intentionally hold connections open.
 */

const logger = require('eb-bot-shared/lib/logger');

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const SSE_TIMEOUT_MS = 300_000; // 5 minutes for SSE
const HEALTH_TIMEOUT_MS = 5_000; // 5 seconds for health checks

/**
 * Request timeout middleware.
 *
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {Object} options - { excludePaths: ['/api/health'], logTimeouts: true }
 */
function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS, options = {}) {
    const { excludePaths = [], logTimeouts = true } = options;

    return (req, res, next) => {
        // Skip timeout for excluded paths
        if (excludePaths.some(p => req.path.startsWith(p))) {
            return next();
        }

        // Skip for SSE connections (they hold open intentionally)
        if (req.path === '/api/events/stream') {
            return next();
        }

        const timer = setTimeout(() => {
            if (!res.headersSent) {
                if (logTimeouts) {
                    logger.warn('Request timeout', {
                        path: req.originalUrl,
                        method: req.method,
                        userId: req.session?.user?.id,
                        requestId: req.requestId,
                        timeoutMs,
                    });
                }

                res.status(408).json({
                    error: 'Request timeout',
                    code: 'REQUEST_TIMEOUT',
                    requestId: req.requestId,
                });
            }
        }, timeoutMs);

        // Clear timeout when response finishes
        res.on('finish', () => clearTimeout(timer));
        res.on('close', () => clearTimeout(timer));

        next();
    };
}

/**
 * Aggressive timeout for health checks.
 * Health checks should be fast; slow health checks indicate problems.
 */
function healthTimeout() {
    return requestTimeout(HEALTH_TIMEOUT_MS, { excludePaths: [] });
}

/**
 * Relaxed timeout for long-running operations (backups, restores, etc.).
 */
function longTimeout() {
    return requestTimeout(120_000, { excludePaths: [] }); // 2 minutes
}

module.exports = {
    requestTimeout,
    healthTimeout,
    longTimeout,
    DEFAULT_TIMEOUT_MS,
    SSE_TIMEOUT_MS,
    HEALTH_TIMEOUT_MS,
};
