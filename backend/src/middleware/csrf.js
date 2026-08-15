/**
 * CSRF defence for a cookie-authenticated, same-origin SPA.
 *
 * The dashboard authenticates with a session cookie, so any state-changing
 * request a victim's browser can be tricked into sending is a CSRF candidate.
 * `SameSite=lax` blocks the classic cross-site POST in modern browsers, but it
 * is not a complete control:
 *
 *   - it does nothing if the cookie is ever reconfigured to SameSite=None
 *     (which DASHBOARD_SECURE + a cross-site embed would tempt);
 *   - "same site" is eTLD+1, so another subdomain of the deployment domain
 *     still counts as same-site and can forge requests;
 *   - older and embedded webviews do not enforce it.
 *
 * So we add an explicit origin check on unsafe methods. The React client is
 * served from the same origin as the API and uses relative URLs, so a strict
 * same-origin rule costs nothing operationally.
 *
 * Rejects rather than sanitises: unknown state must deny.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Origins an operator has explicitly declared trustworthy. */
function configuredOrigins() {
    const out = new Set();
    for (const raw of [process.env.DASHBOARD_URL, process.env.DASHBOARD_ORIGIN]) {
        if (!raw) continue;
        try { out.add(new URL(raw).origin); } catch { /* ignore malformed config */ }
    }
    return out;
}

/** The origin this very request was addressed to, honouring a trusted proxy. */
function requestOrigin(req) {
    const xfHost = req.headers['x-forwarded-host'];
    const host = (typeof xfHost === 'string' ? xfHost.split(',')[0].trim() : null) || req.headers.host;
    if (!host) return null;
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (req.secure ? 'https' : 'http');
    return `${proto}://${host}`;
}

function isLoopbackHost(origin) {
    try {
        const h = new URL(origin).hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
    } catch { return false; }
}

function csrfGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // No Origin and no Referer: server-to-server clients (curl, CI, the bot's
    // own scripts) rather than a browser. Browsers always send Origin on
    // cross-origin unsafe requests, so this cannot be used to forge one.
    if (!origin && !referer) return next();

    let candidate = origin;
    if (!candidate && referer) {
        try { candidate = new URL(referer).origin; } catch { candidate = null; }
    }
    if (!candidate || candidate === 'null') {
        return res.status(403).json({ error: 'Cross-origin request blocked', code: 'CSRF_ORIGIN' });
    }

    const allowed = configuredOrigins();
    const self = requestOrigin(req);
    if (self) allowed.add(self);

    if (allowed.has(candidate)) return next();
    // Local development across assorted localhost ports.
    if (isLoopbackHost(candidate) && (!self || isLoopbackHost(self))) return next();

    return res.status(403).json({ error: 'Cross-origin request blocked', code: 'CSRF_ORIGIN' });
}

module.exports = { csrfGuard, configuredOrigins, requestOrigin };
