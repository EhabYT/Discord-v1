/**
 * HTTP-facing errors for shared services.
 *
 * Services under shared/services/ are used by both the Discord bot commands
 * (which read `err.message` directly) and the Express dashboard API (which
 * funnels rejections through backend/src/middleware/errors.js `classify()`).
 * Plain `Error` throws surfaced as 500 "Internal server error" on the API —
 * e.g. posting a suggestion without a configured channel — hiding the
 * actionable message from dashboard operators.
 *
 * This module lives in shared/ (not backend/) so services can raise
 * status-carrying errors without creating a shared → backend require cycle.
 * The backend honours them via duck-typing (`status` + explicit `expose`),
 * never via instanceof, so the two ApiError classes never need to unify.
 */
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
const notFound = (msg, code) => new ApiError(404, msg, code);

module.exports = { ApiError, badRequest, notFound };
