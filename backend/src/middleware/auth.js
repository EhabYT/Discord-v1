/**
 * Centralised dashboard authentication gate.
 *
 * SECURITY MODEL — fails CLOSED.
 *
 * Previously each router did:
 *     if (!userId) {
 *         if (process.env.DASHBOARD_AUTH === 'true') return 401;
 *         return next();               // ← anonymous = full admin
 *     }
 * Forgetting to set one env var silently exposed ~104 privileged routes
 * (ban/kick/role-grant/leave) to the public internet via keep-tunnel.sh.
 *
 * Now: no session ⇒ 401, always — UNLESS an operator explicitly sets
 * DASHBOARD_AUTH=false AND the request arrives on the loopback interface.
 * That keeps local development frictionless while making it impossible to
 * accidentally publish an open dashboard through a tunnel or reverse proxy.
 */

const logger = require('../../../shared/lib/logger');

let warnedAnonymous = false;
let warnedRemoteBlocked = false;

/** True when DASHBOARD_AUTH is explicitly "false" (the only anonymous opt-in). */
function anonymousOptIn() {
    return String(process.env.DASHBOARD_AUTH).toLowerCase() === 'false';
}

/**
 * True when the socket peer is loopback.
 *
 * Deliberately uses req.socket.remoteAddress and NOT X-Forwarded-For:
 * that header is attacker-controlled, and behind Cloudflare/nginx the peer
 * is the proxy, not the browser. A tunnelled request therefore never counts
 * as local even though cloudflared connects to 127.0.0.1 — because the
 * proxy hop makes req.ip a forwarded address under `trust proxy`.
 */
function isLoopback(req) {
    const addr = req.socket?.remoteAddress || '';
    const bare = addr.replace(/^::ffff:/, '');
    if (bare !== '127.0.0.1' && bare !== '::1') return false;
    // Any forwarding header means the request was relayed from elsewhere.
    if (req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) return false;
    return true;
}

/** Allow this unauthenticated request through? Only local + explicit opt-in. */
function allowAnonymous(req) {
    if (!anonymousOptIn()) return false;
    if (!isLoopback(req)) {
        if (!warnedRemoteBlocked) {
            warnedRemoteBlocked = true;
            logger.warn('DASHBOARD_AUTH=false but a NON-LOCAL request was blocked — anonymous access is loopback-only');
        }
        return false;
    }
    if (!warnedAnonymous) {
        warnedAnonymous = true;
        logger.warn('DASHBOARD_AUTH=false — anonymous LOCAL access enabled. Never use this on a public/tunnelled host.');
    }
    return true;
}

/** The signed-in Discord user id, or null. */
function sessionUserId(req) {
    return req.session?.user?.id || null;
}

/**
 * Express middleware: require a logged-in session.
 * Attaches req.userId when authenticated; req.anonymousLocal for dev bypass.
 */
function requireAuth(req, res, next) {
    const userId = sessionUserId(req);
    if (userId) {
        req.userId = userId;
        return next();
    }
    if (allowAnonymous(req)) {
        req.userId = null;
        req.anonymousLocal = true;
        return next();
    }
    return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
}

/** Startup banner so a dangerous configuration is never silent. */
function logAuthMode() {
    if (anonymousOptIn()) {
        logger.warn('╔══════════════════════════════════════════════════════════════╗');
        logger.warn('║ DASHBOARD_AUTH=false — UNAUTHENTICATED LOCAL ACCESS ENABLED  ║');
        logger.warn('║ Permitted from 127.0.0.1 only. Remove before tunnelling.     ║');
        logger.warn('╚══════════════════════════════════════════════════════════════╝');
    } else {
        logger.info('Dashboard auth: ENFORCED — Discord OAuth required for all API access');
        if (!process.env.CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
            logger.warn('CLIENT_ID / DISCORD_CLIENT_SECRET not set — OAuth login cannot succeed, so nobody will be able to sign in');
        }
    }
}

module.exports = { requireAuth, allowAnonymous, sessionUserId, isLoopback, logAuthMode };
