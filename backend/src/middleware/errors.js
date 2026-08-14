'use strict';

const { randomUUID } = require('crypto');
const logger = require('../../../shared/lib/logger');

class ApiError extends Error {
    constructor(status, message, code = 'API_ERROR') {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }
}

const badRequest = (message, code = 'BAD_REQUEST') => new ApiError(400, message, code);

const DISCORD_ERRORS = {
    50013: [403, 'Missing permissions'],
    50001: [403, 'Cannot access this Discord resource'],
    10007: [404, 'Unknown member'],
    10011: [404, 'Unknown role'],
};

function classify(error) {
    if (error instanceof ApiError) {
        return { status: error.status, message: error.message, code: error.code };
    }
    const discord = DISCORD_ERRORS[Number(error?.code)];
    if (discord) return { status: discord[0], message: discord[1], code: `DISCORD_${error.code}` };
    if (error?.type === 'entity.too.large') {
        return { status: 413, message: 'Request body is too large', code: 'BODY_TOO_LARGE' };
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return { status: 400, message: 'Malformed JSON body', code: 'BAD_JSON' };
    }
    return { status: 500, message: 'Internal server error', code: 'INTERNAL_ERROR' };
}

function errorHandler(error, req, res, _next) {
    const requestId = randomUUID();
    const result = classify(error);
    if (result.status >= 500) {
        logger.error('Dashboard request failed', {
            requestId,
            method: req.method,
            path: req.originalUrl,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
        });
    }
    if (res.headersSent) return;
    res.status(result.status).json({
        error: result.message,
        code: result.code,
        requestId,
    });
}

module.exports = { ApiError, badRequest, classify, errorHandler };
