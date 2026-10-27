/**
 * Secure Error Handling Middleware
 *
 * Provides centralized error handling that prevents sensitive information
 * leakage while maintaining useful error responses for debugging.
 */

const logger = require('eb-bot-shared/lib/logger');

/**
 * Error types that can be safely exposed to clients
 */
const SAFE_ERROR_CODES = new Set([
    'VALIDATION_ERROR',
    'AUTH_REQUIRED',
    'FORBIDDEN',
    'NOT_FOUND',
    'RATE_LIMITED',
    'IP_BLOCKED',
    'SESSION_EXPIRED',
    'COOLDOWN',
    'SIGNATURE_REQUIRED',
    'SIGNATURE_EXPIRED',
    'INVALID_SIGNATURE',
]);

/**
 * Sensitive patterns that must never appear in error responses
 */
const SENSITIVE_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /authorization/i,
    /cookie/i,
    /session/i,
    /database/i,
    /postgres/i,
    /redis/i,
    /mongodb/i,
    /connection/i,
    /enoent/i,
    /econnrefused/i,
    /eperm/i,
    /eacces/i,
];

/**
 * Sanitize an error message for client consumption.
 * Removes sensitive patterns and limits length.
 */
function sanitizeErrorMessage(message) {
    if (!message || typeof message !== 'string') return 'An error occurred';

    let sanitized = message;

    for (const pattern of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    sanitized = sanitized
        .replace(/(?:password|secret|token|key)\s*[=:]\s*\S+/gi, '[REDACTED]')
        .replace(/(?:at|in|from)\s+.*?\.js:\d+/gi, '')
        .replace(/node_modules.*$/gi, '')
        .trim();

    if (sanitized.length > 200) {
        sanitized = sanitized.slice(0, 200) + '...';
    }

    return sanitized || 'An error occurred';
}

/**
 * Determine the HTTP status code from an error.
 */
function getStatusCode(err) {
    if (err.statusCode) return err.statusCode;
    if (err.status) return err.status;

    if (err.code === 'ENOENT') return 404;
    if (err.code === 'EACCES' || err.code === 'EPERM') return 403;
    if (err.code === 'ECONNREFUSED') return 503;
    if (err.code === 'ETIMEDOUT') return 504;

    if (err.name === 'ValidationError') return 400;
    if (err.name === 'UnauthorizedError') return 401;
    if (err.name === 'ForbiddenError') return 403;
    if (err.name === 'NotFoundError') return 404;

    return 500;
}

/**
 * Create error response object.
 */
function createErrorResponse(err, req, errorId) {
    const statusCode = getStatusCode(err);
    const isClientError = statusCode >= 400 && statusCode < 500;

    const suppliedCode = typeof err.code === 'string' ? err.code : '';
    const safeCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(suppliedCode)
        ? suppliedCode
        : (isClientError ? `HTTP_${statusCode}` : 'INTERNAL_ERROR');
    const response = {
        error: isClientError ? sanitizeErrorMessage(err.message) : 'Internal server error',
        code: safeCode,
        errorId,
    };

    if (req.requestId) {
        response.requestId = req.requestId;
    }

    return { statusCode, response };
}

/**
 * Generate a unique error ID for correlation.
 */
function generateErrorId() {
    const crypto = require('crypto');
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Global error handling middleware.
 * Must be registered after all routes (4-argument signature).
 */
function errorHandler(err, req, res, _next) {
    const errorId = generateErrorId();

    const { statusCode, response } = createErrorResponse(err, req, errorId);

    const route = typeof req.route?.path === 'string'
        ? req.route.path.slice(0, 200)
        : 'unmatched';
    const logData = {
        errorId,
        statusCode,
        code: response.code,
        route,
        method: typeof req.method === 'string' ? req.method.slice(0, 12) : 'UNKNOWN',
        requestId: typeof req.requestId === 'string'
            ? req.requestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
            : undefined,
    };

    if (statusCode >= 500) {
        logger.error('Server error', logData);
    } else if (statusCode >= 400) {
        logger.warn('Client error', logData);
    }

    res.status(statusCode).json(response);
}

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: 'Not found',
        code: 'NOT_FOUND',
        path: req.originalUrl,
    });
}

/**
 * Async route wrapper that catches errors.
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    sanitizeErrorMessage,
    SAFE_ERROR_CODES,
};
