'use strict';

/**
 * Dashboard authentication is fail-closed. The only bypass is an explicit
 * DASHBOARD_AUTH=false request made directly from the loopback interface.
 */
function isLoopback(req) {
    const address = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (address !== '127.0.0.1' && address !== '::1') return false;
    return !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-host'];
}

function localBypassEnabled(req) {
    return process.env.NODE_ENV !== 'production'
        && process.env.DASHBOARD_AUTH === 'false'
        && isLoopback(req);
}

function requireAuth(req, res, next) {
    if (req.session?.user?.id || localBypassEnabled(req)) return next();
    return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
}

function warnIfLocalBypass(logger) {
    if (process.env.DASHBOARD_AUTH === 'false' && process.env.NODE_ENV !== 'production') {
        logger.warn('DASHBOARD_AUTH=false: localhost-only dashboard bypass is enabled');
    }
}

module.exports = { isLoopback, localBypassEnabled, requireAuth, warnIfLocalBypass };
