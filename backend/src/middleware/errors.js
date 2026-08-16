/**
 * Centralised API error handling.
 *
 * Before this, 128 route handlers each ended with the same line:
 *
 *     catch (err) { res.status(500).json({ error: err.message }); }
 *
 * Three problems with that:
 *
 *  1. **Information disclosure.** `err.message` is returned verbatim. Verified
 *     leaks: `ENOENT: no such file or directory, open '/srv/app/secret.json'`
 *     exposes absolute filesystem paths, and internal TypeErrors expose code
 *     structure. Neither is useful to an API client.
 *  2. **No classification.** A Discord "Missing Permissions" (the operator's
 *     misconfiguration, a 403) and a genuine crash (a 500) were indistinguishable
 *     to callers and to monitoring.
 *  3. **No correlation.** An operator reading a 500 in the browser had no way to
 *     find the matching stack trace in the logs.
 *
 * This module keeps the useful half — actionable messages such as "Missing
 * Permissions" still reach the client, because operators need them — while
 * replacing unclassifiable internals with a generic message plus a request id
 * that appears in both the response and the log line.
 */

const crypto = require('crypto');
const logger = require('../../../shared/lib/logger');

/** Errors a route raises deliberately, with an intended HTTP status. */
class ApiError extends Error {
    constructor(status, message, code) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.expose = true;
    }
}

const badRequest = (msg, code) => new ApiError(400, msg, code);
const forbidden = (msg, code) => new ApiError(403, msg, code);
const notFound = (msg, code) => new ApiError(404, msg, code);

/**
 * Map a thrown value onto { status, body }.
 *
 * Discord API errors carry a numeric `code`; the useful ones are translated so
 * the dashboard can show the operator what to fix rather than a bare 500.
 */
function classify(err) {
    if (err instanceof ApiError) {
        return { status: err.status, message: err.message, code: err.code, expose: true };
    }

    // discord.js: DiscordAPIError / HTTPError carry `code` and `status`.
    const dcode = typeof err?.code === 'number' ? err.code : null;
    if (dcode !== null) {
        const map = {
            10003: [404, 'Unknown channel'],
            10004: [404, 'Unknown server'],
            10007: [404, 'Unknown member'],
            10008: [404, 'Unknown message'],
            10011: [404, 'Unknown role'],
            10013: [404, 'Unknown user'],
            30005: [409, 'This server has reached Discord\'s role limit'],
            50001: [403, 'The bot cannot access that resource'],
            50013: [403, 'The bot is missing permissions for that action'],
            50035: [400, 'Discord rejected the request payload'],
        };
        const hit = map[dcode];
        if (hit) return { status: hit[0], message: hit[1], code: `DISCORD_${dcode}`, expose: true };
    }
    if (err?.name === 'DiscordAPIError' || err?.name === 'HTTPError') {
        return { status: 502, message: 'Discord API request failed', code: 'DISCORD_ERROR', expose: true };
    }

    // Anything else is unexpected: do not echo it back.
    return { status: 500, message: 'Internal server error', code: 'INTERNAL', expose: false };
}

/**
 * Wrap an async route handler so rejections reach Express's error pipeline.
 * Express 5 forwards rejected promises automatically, but wrapping keeps the
 * intent explicit and preserves behaviour if the handler is sync.
 */
function asyncRoute(fn) {
    return (req, res, next) => {
        try {
            const out = fn(req, res, next);
            if (out && typeof out.catch === 'function') out.catch(next);
        } catch (err) {
            next(err);
        }
    };
}

/** Terminal Express error middleware. Must be registered last. */
function errorHandler(err, req, res, next) {
    // Once a streaming response has started, Express's default handler must
    // close/finish the connection. Silently returning here can leave SSE or a
    // partial download hanging forever.
    if (res.headersSent) return next(err);

    const { status, message, code, expose } = classify(err);
    const requestId = crypto.randomBytes(6).toString('hex');

    const logMeta = {
        requestId,
        status,
        method: req.method,
        path: req.originalUrl,
        userId: req.session?.user?.id || null,
        error: err?.message || String(err),
        stack: expose ? undefined : err?.stack,
    };
    if (status >= 500) logger.error('API error', logMeta);
    else logger.warn('API request rejected', logMeta);

    const body = { error: message, requestId };
    if (code) body.code = code;
    res.status(status).json(body);
}

module.exports = {
    ApiError, badRequest, forbidden, notFound,
    classify, asyncRoute, errorHandler,
};
