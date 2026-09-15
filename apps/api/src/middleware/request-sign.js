/**
 * Request Signing Middleware
 *
 * Provides HMAC-SHA256 request signing for API-to-API communication.
 * Ensures requests between backend services are authentic and untampered.
 */

const crypto = require('crypto');
const logger = require('eb-bot-shared/lib/logger');

const SIGNATURE_HEADER = 'x-signature';
const TIMESTAMP_HEADER = 'x-signature-timestamp';
const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Generate HMAC-SHA256 signature for a request.
 *
 * @param {Object} options - Signing options
 * @param {string} options.secret - Signing secret
 * @param {string} options.method - HTTP method
 * @param {string} options.path - Request path
 * @param {string} options.timestamp - ISO timestamp
 * @param {string} [options.body=''] - Request body
 * @returns {string} Hex-encoded signature
 */
function generateSignature({ secret, method, path, timestamp, body = '' }) {
    const payload = `${method.toUpperCase()}:${path}:${timestamp}:${body}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a request signature.
 *
 * @param {Object} options - Verification options
 * @param {string} options.secret - Signing secret
 * @param {string} options.method - HTTP method
 * @param {string} options.path - Request path
 * @param {string} options.timestamp - Timestamp from header
 * @param {string} options.signature - Signature from header
 * @param {string} [options.body=''] - Request body
 * @returns {boolean} True if signature is valid
 */
function verifySignature({ secret, method, path, timestamp, signature, body = '' }) {
    if (!secret || !signature || !timestamp) return false;

    const expected = generateSignature({ secret, method, path, timestamp, body });

    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

/**
 * Create request signing middleware.
 *
 * @param {string} secret - Shared signing secret
 * @returns {Function} Express middleware
 */
function requestSigning(secret) {
    if (!secret) {
        logger.warn('Request signing middleware initialized without secret — signatures will always fail');
    }

    return (req, res, next) => {
        if (!secret) {
            return res.status(500).json({ error: 'Request signing not configured' });
        }

        const timestamp = req.headers[TIMESTAMP_HEADER];
        const signature = req.headers[SIGNATURE_HEADER];

        if (!timestamp || !signature) {
            return res.status(401).json({
                error: 'Missing request signature',
                code: 'SIGNATURE_REQUIRED',
            });
        }

        const age = Date.now() - new Date(timestamp).getTime();
        if (isNaN(age) || age > MAX_AGE_MS || age < -MAX_AGE_MS) {
            return res.status(401).json({
                error: 'Request signature expired',
                code: 'SIGNATURE_EXPIRED',
            });
        }

        const body = req.body ? JSON.stringify(req.body) : '';
        const valid = verifySignature({
            secret,
            method: req.method,
            path: req.originalUrl,
            timestamp,
            signature,
            body,
        });

        if (!valid) {
            logger.warn('Invalid request signature', {
                path: req.originalUrl,
                method: req.method,
            });
            return res.status(401).json({
                error: 'Invalid request signature',
                code: 'INVALID_SIGNATURE',
            });
        }

        next();
    };
}

/**
 * Create a signed fetch wrapper for outgoing API requests.
 *
 * @param {string} secret - Signing secret
 * @returns {Function} Signed fetch function
 */
function createSignedFetcher(secret) {
    // eslint-disable-next-line require-await
    return async (url, options = {}) => {
        const timestamp = new Date().toISOString();
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(options.body) : '';

        const signature = generateSignature({
            secret,
            method,
            path: new URL(url).pathname,
            timestamp,
            body,
        });

        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                [SIGNATURE_HEADER]: signature,
                [TIMESTAMP_HEADER]: timestamp,
                'Content-Type': 'application/json',
            },
        });
    };
}

module.exports = {
    requestSigning,
    generateSignature,
    verifySignature,
    createSignedFetcher,
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    MAX_AGE_MS,
};
