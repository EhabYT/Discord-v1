const DAY_MS = 24 * 60 * 60 * 1000;

function deviceLabel(req) {
    return String(req?.headers?.['user-agent'] || 'Unknown browser')
        .replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
        || 'Unknown browser';
}

function attachSessionSecurity(session, req, { reauthenticated = true } = {}) {
    const now = Date.now();
    session.security = {
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: now + DAY_MS,
        deviceLabel: deviceLabel(req),
        reauthenticatedAt: reauthenticated ? now : null,
    };
}

function touchSessionSecurity(session) {
    if (session.security) session.security.lastSeenAt = Date.now();
}

function hasRecentReauthentication(session, maxAgeMs = 10 * 60 * 1000) {
    const at = Number(session?.security?.reauthenticatedAt || 0);
    return at > 0 && Date.now() - at <= maxAgeMs;
}

function markReauthenticated(session) {
    if (!session.security) attachSessionSecurity(session, { headers: {} });
    session.security.reauthenticatedAt = Date.now();
}

module.exports = {
    DAY_MS, deviceLabel, attachSessionSecurity, touchSessionSecurity,
    hasRecentReauthentication, markReauthenticated,
};
