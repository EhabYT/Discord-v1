'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins(req) {
    const values = [
        process.env.DASHBOARD_URL,
        process.env.DASHBOARD_ORIGIN,
        `${req.protocol}://${req.get('host')}`,
    ].filter(Boolean);
    return new Set(values.map((value) => {
        try { return new URL(value).origin; } catch { return null; }
    }).filter(Boolean));
}

function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const raw = req.get('origin') || req.get('referer');
    // Non-browser clients do not always send either header. Browsers do send
    // Origin for cross-origin unsafe requests, so absence is not treated as a
    // forged browser request.
    if (!raw) return next();

    let origin;
    try { origin = new URL(raw).origin; } catch { origin = null; }
    if (origin && allowedOrigins(req).has(origin)) return next();
    return res.status(403).json({
        error: 'Cross-origin request blocked',
        code: 'CSRF_ORIGIN',
    });
}

module.exports = { csrfProtection, allowedOrigins };
