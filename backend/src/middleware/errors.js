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
const logger = require('eb-bot-shared/lib/logger');

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

    // Shared services (shared/services/*) raise duck-typed HTTP errors via
    // shared/lib/http-errors.js so dashboard validation failures surface as
    // 400/404 with their actionable message instead of 500 "Internal server
    // error". Honoured only with an explicit expose flag and a numeric 4xx/5xx
    // status: DiscordAPIError also carries `.status`, but never `expose`, so
    // the Discord branches below are unaffected.
    if (err?.expose === true && Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) {
        return {
            status: err.status,
            message: String(err.message || 'Request failed').slice(0, 300),
            code: typeof err.code === 'string' ? err.code.slice(0, 40) : undefined,
            expose: true,
        };
    }

    // discord.js: DiscordAPIError / HTTPError carry `code` and `status`.
    const dcode = typeof err?.code === 'number' ? err.code : null;
    if (dcode === 50035) {
        // Invalid Form Body: Discord names the offending field
        // (e.g. components[0]...emoji.name). That detail is the operator's
        // own payload reflected back, so it is safe to expose and it turns
        // a cryptic rejection into an actionable message.
        const detail = String(err?.message || '').replace(/\s+/g, ' ').slice(0, 220);
        return {
            status: 400,
            message: detail && detail !== 'Invalid Form Body'
                ? `Discord rejected the request payload: ${detail}`
                : 'Discord rejected the request payload',
            code: 'DISCORD_50035',
            expose: true,
        };
    }
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
        };
        const hit = map[dcode];
        if (hit) return { status: hit[0], message: hit[1], code: `DISCORD_${dcode}`, expose: true };
    }
    if (err?.name === 'DiscordAPIError' || err?.name === 'HTTPError') {
        return { status: 502, message: 'Discord API request failed', code: 'DISCORD_ERROR', expose: true };
    }

    // node-postgres/network errors are operational, not application crashes.
    // Return a stable actionable code without exposing hosts, usernames or the
    // connection string that may be embedded in the original message.
    const pgCode = String(err?.code || '');
    const pgMessage = String(err?.message || '').toLowerCase();
    if (pgCode === '28P01' || pgMessage.includes('password authentication failed')) {
        return {
            status: 503,
            message: 'Database credentials were rejected. Verify the Supabase Session Pooler URI.',
            code: 'DATABASE_AUTH_FAILED',
            expose: true,
        };
    }
    if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(pgCode)
        || pgMessage.includes('connection timeout')
        || pgMessage.includes('connection terminated')
        || pgMessage.includes('database is unreachable')) {
        return {
            status: 503,
            message: 'Database is temporarily unavailable. Verify DATABASE_URL and Supabase Session Pooler settings.',
            code: 'DATABASE_UNAVAILABLE',
            expose: true,
        };
    }

    // discord-player failures are operational (unresolvable URL/query, missing
    // voice engine), not application crashes. Surfacing them as 500 filled
    // error.log with full stacks for ordinary user input.
    if (err?.name === 'NoResultError'
        || /no results found/i.test(String(err?.message || ''))) {
        return {
            status: 400,
            message: 'No playable track found for that URL or search query.',
            code: 'MUSIC_NO_RESULTS',
            expose: true,
        };
    }
    if (/could not load ffmpeg/i.test(String(err?.message || ''))) {
        return {
            status: 503,
            message: 'Voice audio engine is unavailable. Try again shortly.',
            code: 'MUSIC_ENGINE_UNAVAILABLE',
            expose: true,
        };
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
    const requestId = req.requestId || crypto.randomBytes(6).toString('hex');

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
