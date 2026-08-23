const assert = require('assert');
const {
    DAY_MS, deviceLabel, attachSessionSecurity, touchSessionSecurity,
    hasRecentReauthentication, markReauthenticated,
} = require('../../shared/services/account-sessions');

(() => {
    const req = { headers: { 'user-agent': 'Example\nBrowser  1.0' } };
    assert.strictEqual(deviceLabel(req), 'ExampleBrowser 1.0');
    const session = {};
    const before = Date.now();
    attachSessionSecurity(session, req);
    assert(session.security.createdAt >= before);
    assert(session.security.absoluteExpiresAt - session.security.createdAt === DAY_MS);
    assert.strictEqual(hasRecentReauthentication(session), true);
    const previous = session.security.lastSeenAt;
    touchSessionSecurity(session);
    assert(session.security.lastSeenAt >= previous);
    session.security.reauthenticatedAt = Date.now() - 11 * 60 * 1000;
    assert.strictEqual(hasRecentReauthentication(session), false);
    markReauthenticated(session);
    assert.strictEqual(hasRecentReauthentication(session), true);
    console.log('Account session policy tests passed.');
})();
