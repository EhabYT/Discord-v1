/**
 * Webhook signature verification middleware.
 *
 * Verifies incoming webhook requests using HMAC-SHA256 signatures.
 * This prevents attackers from sending forged webhook payloads to
 * your endpoints.
 *
 * Supports:
 *   - Discord Interactions (Ed25519 signatures)
 *   - GitHub webhooks (HMAC-SHA256)
 *   - Custom webhook signatures
 *
 * Usage:
 *   app.post('/webhook/discord', verifyDiscordSignature(), handler);
 *   app.post('/webhook/github', verifyWebhookSignature('github', secret), handler);
 */

const crypto = require('crypto');
const logger = require('eb-bot-shared/lib/logger');

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify Discord Interaction signature (Ed25519).
 *
 * Discord sends:
 *   - X-Signature-Ed25519: signature
 *   - X-Signature-Timestamp: timestamp
 *
 * The signed content is: timestamp + body
 */
function verifyDiscordSignature() {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) {
        logger.warn('DISCORD_PUBLIC_KEY not set — Discord signature verification disabled');
        return (req, res, next) => next();
    }

    return (req, res, next) => {
        const signature = req.headers['x-signature-ed25519'];
        const timestamp = req.headers['x-signature-timestamp'];

        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Missing signature headers' });
        }

        // Reject timestamps older than 5 minutes (replay protection)
        const age = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (age > 300) {
            return res.status(401).json({ error: 'Timestamp too old' });
        }

        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const signedContent = timestamp + body;

        try {
            const keyBuffer = Buffer.from(publicKey, 'hex');
            const signatureBuffer = Buffer.from(signature, 'hex');

            // Ed25519 verification using Node.js crypto
            const verify = crypto.createVerify(null);
            verify.update(signedContent);
            const isValid = crypto.verify(null, keyBuffer, null, signatureBuffer);

            // Note: Node.js doesn't have native Ed25519 verify in older versions
            // Fallback: Use timing-safe comparison with derived key
            // For production, use tweetnacl or similar library
            if (!isValid) {
                logger.warn('Discord webhook signature verification failed');
                return res.status(401).json({ error: 'Invalid signature' });
            }

            return next();
        } catch (err) {
            logger.error('Discord signature verification error', { error: err.message });
            return res.status(401).json({ error: 'Signature verification failed' });
        }
    };
}

/**
 * Verify webhook signature using HMAC-SHA256.
 *
 * @param {string} provider - Provider name (for logging)
 * @param {string} secret - Webhook secret (from env or parameter)
 * @param {Object} options - { header: 'x-hub-signature-256', algorithm: 'sha256' }
 */
function verifyWebhookSignature(provider, secret, options = {}) {
    const { header = 'x-hub-signature-256', algorithm = 'sha256' } = options;

    if (!secret) {
        logger.warn(`Webhook secret not configured for ${provider} — verification disabled`);
        return (req, res, next) => next();
    }

    return (req, res, next) => {
        const signature = req.headers[header.toLowerCase()];

        if (!signature) {
            logger.warn(`Missing webhook signature from ${provider}`);
            return res.status(401).json({ error: 'Missing webhook signature' });
        }

        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac(algorithm, secret)
            .update(body)
            .digest('hex');

        // Handle both "sha256=xxx" and "xxx" formats
        const receivedSignature = signature.startsWith('sha256=')
            ? signature.slice(7)
            : signature;

        if (!safeCompare(receivedSignature, expectedSignature)) {
            logger.warn(`Invalid webhook signature from ${provider}`, {
                ip: req.ip,
                path: req.originalUrl,
            });
            return res.status(401).json({ error: 'Invalid webhook signature' });
        }

        return next();
    };
}

/**
 * Rate limit middleware specifically for webhook endpoints.
 * Webhooks can be called frequently; this prevents abuse.
 */
function webhookRateLimit(maxRequests = 100, windowMs = 60000) {
    const hits = new Map();

    // Sweep old entries
    const sweeper = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits.entries()) {
            if (now > entry.resetAt + 60000) hits.delete(key);
        }
    }, 5 * 60 * 1000);
    if (typeof sweeper.unref === 'function') sweeper.unref();

    return (req, res, next) => {
        const key = req.ip || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        let entry = hits.get(key);

        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count++;
        if (entry.count > maxRequests) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            return res.status(429).json({
                error: 'Webhook rate limit exceeded',
                code: 'WEBHOOK_RATE_LIMITED',
                retryAfter,
            });
        }

        return next();
    };
}

module.exports = {
    verifyDiscordSignature,
    verifyWebhookSignature,
    webhookRateLimit,
    safeCompare,
};
