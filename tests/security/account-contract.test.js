const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(() => {
    console.log('\nComplete account/authentication contract:\n');
    const app = read('dashboard/src/App.jsx');
    for (const route of ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/profile', '/settings', '/settings/security']) {
        assert(app.includes(`'${route}'`), `missing UI route ${route}`);
    }
    assert.match(app, /accountProtectedPage/);
    assert.match(app, /window\.location\.replace\(`\/login\?return=/);

    const authRoutes = read('backend/src/routes/account-auth.js');
    for (const endpoint of ['/register', '/login', '/mfa/verify', '/forgot-password', '/reset-password', '/verify-email']) {
        assert(authRoutes.includes(`'${endpoint}'`), `missing auth endpoint ${endpoint}`);
    }
    assert.match(authRoutes, /dummyHashPromise/, 'unknown accounts must still perform password verification work');
    assert.match(authRoutes, /attachMfaChallenge/, 'MFA accounts must not become authenticated after password only');

    const accountRoutes = read('backend/src/routes/account.js');
    for (const endpoint of ['/profile', '/email/change', '/password/change', '/mfa/enroll', '/mfa/confirm', '/mfa/disable', '/recovery-codes/regenerate', '/sessions', '/sessions/revoke-others', '/sessions/revoke-all', '/activity', '/reauthenticate', '/deactivate', '/avatar']) {
        assert(accountRoutes.includes(`'${endpoint}'`) || accountRoutes.includes(`'${endpoint}/:id'`), `missing account endpoint ${endpoint}`);
    }
    assert.match(accountRoutes, /hasRecentReauthentication/, 'deactivation must require recent reauthentication');
    assert.match(accountRoutes, /confirmation[^\n]*DELETE/, 'deactivation must require typed confirmation');

    const schema = read('supabase/schema.sql');
    for (const table of ['accounts', 'account_credentials', 'account_email_tokens', 'account_mfa_totp', 'account_recovery_codes', 'account_session_metadata', 'account_security_events']) {
        assert(schema.includes(`public.${table}`), `missing schema table ${table}`);
    }
    assert(!/password_hash[^\n]*SELECT/i.test(read('backend/src/routes/account.js')));

    const profile = read('dashboard/src/pages/Profile.jsx');
    const security = read('dashboard/src/pages/AccountSecurity.jsx');
    for (const source of [profile, security]) {
        assert.match(source, /cyber-card/);
        assert.match(source, /sm:/, 'account pages must retain mobile-first responsive classes');
    }
    assert.match(profile, /Link Discord for server access/);
    assert.match(security, /Active sessions/);
    assert.match(security, /Security activity/);
    assert.match(security, /Danger Zone/);

    const authMiddleware = read('backend/src/middleware/auth.js');
    const guildMiddleware = read('backend/src/middleware/guild-access.js');
    assert.match(authMiddleware, /session\?\.user\?\.id/, 'Discord session ID remains explicit');
    assert.match(guildMiddleware, /sessionUserId/, 'guild access must continue using Discord identity');

    console.log('  PASS  all required public/protected UI routes exist');
    console.log('  PASS  credential, verification, recovery, MFA, profile and session APIs exist');
    console.log('  PASS  account schema and backend-only credential separation exist');
    console.log('  PASS  account pages reuse responsive Dashboard design primitives');
    console.log('  PASS  Discord guild identity remains separate from account identity');
    console.log('\nComplete account contract checks passed.\n');
})();
