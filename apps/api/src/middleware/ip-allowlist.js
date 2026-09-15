/**
 * IP allowlist middleware for sensitive endpoints.
 *
 * Provides optional IP-based access control for:
 *   - Setup endpoints (should only be accessible locally)
 *   - Developer endpoints (optional IP restriction)
 *   - Backup/restore endpoints (optional IP restriction)
 *
 * When IP_ALLOWLIST is not set, all IPs are allowed (permissive default).
 * When IP_ALLOWLIST is set, only listed IPs/CIDRs are allowed.
 *
 * Supports:
 *   - Individual IPs: 127.0.0.1, ::1
 *   - CIDR ranges: 192.168.1.0/24
 *   - Loopback detection
 */

const logger = require('eb-bot-shared/lib/logger');

/**
 * Parse IP from request, handling proxy headers.
 * Uses req.socket.remoteAddress for trusted proxy detection.
 */
function getClientIp(req) {
    // When trust proxy is enabled, Express uses X-Forwarded-For
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || '';
}

/**
 * Normalize IPv6 mapped IPv4 addresses.
 * ::ffff:127.0.0.1 → 127.0.0.1
 */
function normalizeIp(ip) {
    return ip.replace(/^::ffff:/, '');
}

/**
 * Check if an IP is loopback.
 */
function isLoopback(ip) {
    const normalized = normalizeIp(ip);
    return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

/**
 * Check if an IP matches a CIDR range.
 * Simple implementation for common cases (doesn't handle all edge cases).
 */
function ipMatchesCidr(ip, cidr) {
    const [range, bits] = cidr.split('/');
    if (!bits) return ip === range;

    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = ipToNum(normalizeIp(ip));
    const rangeNum = ipToNum(range);

    return (ipNum & mask) === (rangeNum & mask);
}

function ipToNum(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Check if an IP is in the allowlist.
 * @param {string} ip - Client IP
 * @param {string[]} allowlist - Array of IPs/CIDRs
 */
function isIpAllowed(ip, allowlist) {
    const normalized = normalizeIp(ip);

    // Always allow loopback unless explicitly blocked
    if (isLoopback(normalized)) {
        return true;
    }

    for (const entry of allowlist) {
        if (entry.includes('/')) {
            if (ipMatchesCidr(normalized, entry)) return true;
        } else {
            if (normalizeIp(entry) === normalized) return true;
        }
    }

    return false;
}

/**
 * Parse IP_ALLOWLIST environment variable.
 * Format: comma-separated IPs/CIDRs
 */
function parseAllowlist() {
    const raw = process.env.IP_ALLOWLIST;
    if (!raw) return null;
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * IP allowlist middleware.
 *
 * @param {Object} options
 * @param {string[]} options.allowed - Explicit allowlist (overrides env)
 * @param {string} options.label - Label for logging (e.g. 'setup', 'backup')
 * @param {boolean} options.denyLoopback - Also block loopback (dangerous!)
 */
function ipAllowlist(options = {}) {
    const { allowed, label = 'endpoint', denyLoopback = false } = options;

    return (req, res, next) => {
        const allowlist = allowed || parseAllowlist();

        // If no allowlist configured, allow all
        if (!allowlist || allowlist.length === 0) {
            return next();
        }

        const clientIp = getClientIp(req);

        // Check loopback
        if (!denyLoopback && isLoopback(clientIp)) {
            return next();
        }

        // Check allowlist
        if (isIpAllowed(clientIp, allowlist)) {
            return next();
        }

        // Deny
        logger.warn('IP allowlist denial', {
            ip: clientIp,
            label,
            path: req.originalUrl,
            requestId: req.requestId,
        });

        return res.status(403).json({
            error: 'Access denied',
            code: 'IP_NOT_ALLOWED',
        });
    };
}

/**
 * Convenience middleware for setup endpoints (loopback only).
 */
function loopbackOnly() {
    return ipAllowlist({
        allowed: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
        label: 'setup',
    });
}

module.exports = {
    ipAllowlist,
    loopbackOnly,
    getClientIp,
    normalizeIp,
    isLoopback,
    isIpAllowed,
    parseAllowlist,
};
