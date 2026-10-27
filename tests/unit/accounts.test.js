const assert = require('assert');
const { AccountStore, normalizeUsername, sanitizePreferences, ACCOUNT_SCHEMA_SQL } = require('eb-bot-database/accounts');
const { BIO_MAX_LENGTH, normalizeBio, normalizePreferences } = require('eb-bot-shared/services/account-validation');

class FakePool {
    constructor() {
        this.accounts = new Map();
        this.identities = new Map();
        this.events = [];
        this.releases = 0;
    }
    query(sql, params = []) { return this.run(sql, params); }
    async connect() {
        return { query: (sql, params = []) => this.run(sql, params), release: () => { this.releases++; } };
    }
    async run(sql, params) {
        if (sql === ACCOUNT_SCHEMA_SQL || /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim()) || /pg_advisory_xact_lock/.test(sql)) return { rows: [] };
        if (/WHERE i.provider = 'discord'/.test(sql)) {
            const identity = this.identities.get(`discord:${String(params[0])}`);
            const account = identity && this.accounts.get(identity.account_id);
            return { rows: account ? [{ ...account, ...identity }] : [] };
        }
        if (/WHERE i.provider = 'google'/.test(sql)) {
            const identity = this.identities.get(`google:${String(params[0])}`);
            const account = identity && this.accounts.get(identity.account_id);
            return { rows: account ? [{ id: account.id, status: account.status }] : [] };
        }
        if (/LEFT JOIN account_identities/.test(sql)) {
            const account = this.accounts.get(String(params[0]));
            const identity = [...this.identities.values()].find(item => item.account_id === params[0] && item.provider === 'discord');
            return { rows: account ? [{ ...account, ...(identity || {}) }] : [] };
        }
        if (/SELECT provider_user_id FROM account_identities/.test(sql)) {
            const identity = [...this.identities.values()].find(item =>
                item.account_id === params[0] && item.provider === 'google');
            return { rows: identity ? [{ provider_user_id: identity.provider_user_id }] : [] };
        }
        if (/SELECT account_id FROM account_identities/.test(sql)) {
            const provider = /provider = 'google'/.test(sql) ? 'google' : 'discord';
            const identity = this.identities.get(`${provider}:${String(params[0])}`);
            return { rows: identity ? [{ account_id: identity.account_id }] : [] };
        }
        if (/SELECT id, status FROM accounts WHERE LOWER\(email\)/.test(sql)) {
            const account = [...this.accounts.values()].find(item => item.email?.toLowerCase() === String(params[0]).toLowerCase());
            return { rows: account ? [{ id: account.id, status: account.status }] : [] };
        }
        if (/SELECT id, status FROM accounts WHERE id/.test(sql)) {
            const account = this.accounts.get(String(params[0]));
            return { rows: account ? [{ id: account.id, status: account.status }] : [] };
        }
        if (/SELECT 1 FROM accounts/.test(sql)) {
            return { rows: [...this.accounts.values()].some(a => a.username.toLowerCase() === params[0].toLowerCase()) ? [{ '?column?': 1 }] : [] };
        }
        if (/UPDATE accounts SET email_verified_at/.test(sql)) {
            const account = this.accounts.get(String(params[0]));
            if (account) account.email_verified_at ||= new Date().toISOString();
            return { rows: [] };
        }
        if (/INSERT INTO accounts/.test(sql)) {
            const googleInsert = /email_verified_at/.test(sql);
            this.accounts.set(params[0], googleInsert ? {
                id: params[0], display_name: params[1], username: params[2], email: params[3],
                email_verified_at: new Date().toISOString(), avatar_url: params[4],
                status: 'active', created_at: new Date().toISOString(),
            } : {
                id: params[0], display_name: params[1], username: params[2], avatar_url: params[3],
                email: null, email_verified_at: null, status: 'active', created_at: new Date().toISOString(),
            });
            return { rows: [] };
        }
        if (/INSERT INTO account_identities/.test(sql)) {
            const provider = /VALUES \(\$1, '([a-z]+)'/.exec(sql)?.[1] || 'discord';
            this.identities.set(`${provider}:${String(params[1])}`, {
                provider, account_id: params[0], provider_user_id: String(params[1]),
                provider_username: params[2], provider_avatar_url: params[3],
            });
            return { rows: [] };
        }
        if (/UPDATE account_identities/.test(sql)) {
            const provider = /provider = '([a-z]+)'/.exec(sql)?.[1] || 'discord';
            const identity = this.identities.get(`${provider}:${String(params[2])}`);
            if (identity) {
                identity.provider_username = params[0];
                identity.provider_avatar_url = params[1];
            }
            return { rows: [] };
        }
        if (/SELECT username_changed_at FROM accounts/.test(sql)) {
            const account = this.accounts.get(String(params[0]));
            return { rows: account ? [{ username_changed_at: account.username_changed_at || null }] : [] };
        }
        if (/UPDATE accounts SET display_name/.test(sql)) {
            const account = this.accounts.get(String(params[2]));
            assert(account, 'updateProfile must target a known account');
            account.display_name = params[0];
            account.username = params[1];
            if (params.length > 3) account.bio = params[3];
            return { rows: [] };
        }
        if (/UPDATE accounts SET preferences/.test(sql)) {
            const account = this.accounts.get(String(params[0]));
            assert(account, 'updatePreferences must target a known account');
            account.preferences = JSON.parse(params[1]);
            return { rows: [] };
        }
        if (/INSERT INTO account_security_events/.test(sql)) {
            this.events.push({ id: params[0], accountId: params[1], requestId: params[2] });
            return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    }
}

(async () => {
    assert.strictEqual(normalizeUsername('  Test User!  '), 'test_user');
    assert.strictEqual(normalizeUsername('99'), 'u_99');
    assert.match(ACCOUNT_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS accounts/);
    assert.match(ACCOUNT_SCHEMA_SQL, /ENABLE ROW LEVEL SECURITY/);

    const pool = new FakePool();
    const store = new AccountStore(pool);
    const first = await store.ensureDiscordAccount({
        id: '111111111111111111', username: 'Test User!', avatar: 'https://cdn.example/old.png',
    }, 'request-1');
    assert.match(first.id, /^[0-9a-f-]{36}$/);
    assert.strictEqual(first.username, 'test_user');
    assert.strictEqual(first.linkedDiscord.id, '111111111111111111');
    assert.strictEqual(first.avatarUrl, 'https://cdn.example/old.png');
    assert.strictEqual(pool.accounts.size, 1);
    assert.strictEqual(pool.events.length, 1, 'provisioning must create one persistent security event');

    const second = await store.ensureDiscordAccount({
        id: '111111111111111111', username: 'Renamed', avatar: 'https://cdn.example/new.png',
    }, 'request-2');
    assert.strictEqual(second.id, first.id, 'same Discord identity must resolve to one account');
    assert.strictEqual(second.linkedDiscord.username, 'Renamed');
    assert.strictEqual(second.avatarUrl, 'https://cdn.example/new.png');
    assert.strictEqual(pool.accounts.size, 1);
    assert.strictEqual(pool.events.length, 1, 'ordinary identity refresh must not duplicate provisioning events');

    const googleUser = {
        id: 'google-subject-123', email: 'Google.User@example.com', emailVerified: true,
        username: 'google.user', displayName: 'Google User', avatar: 'https://example.com/google.png',
    };
    const googleAccount = await store.ensureGoogleAccount(googleUser, 'google-login-1');
    assert.match(googleAccount.id, /^[0-9a-f-]{36}$/);
    assert.strictEqual(googleAccount.email, 'google.user@example.com');
    assert.strictEqual(googleAccount.emailVerified, true);
    assert.strictEqual(googleAccount.linkedDiscord, null, 'Google subject must never be exposed as a Discord identity');
    assert.strictEqual(pool.identities.get('google:google-subject-123')?.provider, 'google');
    const sameGoogleAccount = await store.ensureGoogleAccount(googleUser, 'google-login-2');
    assert.strictEqual(sameGoogleAccount.id, googleAccount.id, 'Google subject must resolve to the same account');
    await assert.rejects(
        store.ensureGoogleAccount({ ...googleUser, id: 'unverified-sub', emailVerified: false }),
        err => err.code === 'GOOGLE_IDENTITY_INVALID',
        'unverified Google email must not create or link an account',
    );

    const localId = '22222222-2222-4222-8222-222222222222';
    pool.accounts.set(localId, { id: localId, display_name: 'Local', username: 'local_user', email: 'local@example.com', email_verified_at: null, status: 'active', created_at: new Date().toISOString() });
    const linked = await store.linkDiscordIdentity(localId, { id: '222222222222222222', username: 'Linked', avatar: null }, 'request-link');
    assert.strictEqual(linked.id, localId);
    assert.strictEqual(linked.linkedDiscord.id, '222222222222222222');
    await assert.rejects(
        store.linkDiscordIdentity(localId, { id: '111111111111111111', username: 'Taken', avatar: null }),
        err => err.code === 'DISCORD_ALREADY_LINKED',
        'an identity linked to another account must never auto-link by email or request',
    );
    assert.strictEqual(pool.events.length, 3, 'Discord provisioning and explicit linking create one event each');

    const linkedGoogle = await store.linkGoogleIdentity(localId, {
        id: 'google-subject-link', email: 'link@example.com', emailVerified: true,
        username: 'linked.google', avatar: null,
    }, 'request-google-link');
    assert.strictEqual(linkedGoogle.id, localId);
    assert.strictEqual(linkedGoogle.linkedDiscord.id, '222222222222222222');
    await assert.rejects(
        store.linkGoogleIdentity(localId, { id: 'different-google-subject', emailVerified: true }),
        err => err.code === 'GOOGLE_ACCOUNT_ALREADY_LINKED',
        'an account must not silently replace its existing Google identity',
    );
    await assert.rejects(
        store.linkGoogleIdentity(first.id, { id: 'google-subject-link', emailVerified: true }),
        err => err.code === 'GOOGLE_ALREADY_LINKED',
        'Google identity must not be linked to a second EB account',
    );
    assert.strictEqual(pool.events.length, 4, 'Google linking creates a security event');
    assert.strictEqual(pool.releases, 9, 'transaction clients must always release');

    assert.match(ACCOUNT_SCHEMA_SQL, /ADD COLUMN IF NOT EXISTS bio/);
    assert.match(ACCOUNT_SCHEMA_SQL, /ADD COLUMN IF NOT EXISTS preferences/);

    assert.strictEqual(BIO_MAX_LENGTH, 160);
    assert.strictEqual(normalizeBio('  hello  '), 'hello');
    assert.strictEqual(normalizeBio(''), '');
    assert.strictEqual(normalizeBio(null), '');
    assert.strictEqual(normalizeBio(undefined), undefined);
    assert.strictEqual(normalizeBio('x'.repeat(160)).length, 160);
    assert.strictEqual(normalizeBio('x'.repeat(161)), null);

    const defaults = { theme: 'dark', language: 'en', timeZone: '', notifications: { email: true, push: true, marketing: false } };
    assert.deepStrictEqual(normalizePreferences(null), defaults);
    assert.deepStrictEqual(normalizePreferences(undefined), defaults);
    assert.deepStrictEqual(normalizePreferences({ theme: 'light', language: 'de', timeZone: 'Europe/Berlin', notifications: { email: false, push: true, marketing: true } }),
        { theme: 'light', language: 'de', timeZone: 'Europe/Berlin', notifications: { email: false, push: true, marketing: true } });
    assert.deepStrictEqual(normalizePreferences({ theme: 'banana', language: 'xx', extra: 'drop-me' }), defaults);
    assert.strictEqual(normalizePreferences({ timeZone: 'Mars/Olympus' }), null);
    assert.deepStrictEqual(
        normalizePreferences({ notifications: { push: false } }, { theme: 'light', timeZone: 'Europe/Berlin', notifications: { email: false } }),
        { theme: 'light', language: 'en', timeZone: 'Europe/Berlin', notifications: { email: false, push: false, marketing: false } });
    assert.deepStrictEqual(sanitizePreferences({ theme: 'system', notifications: [1, 2] }), { ...defaults, theme: 'system' });
    assert.deepStrictEqual(sanitizePreferences(null), defaults);

    const untouched = await store.updateProfile(localId, { displayName: 'Local Renamed', username: 'local_user' });
    assert.strictEqual(untouched.account.displayName, 'Local Renamed');
    assert.strictEqual(untouched.account.bio, null, 'absent bio must leave the stored value unchanged');
    const withBio = await store.updateProfile(localId, { displayName: 'Local Renamed', username: 'local_user', bio: '  night owl  ' });
    assert.strictEqual(withBio.account.bio, '  night owl  ', 'store persists the normalized route value verbatim');
    const cleared = await store.updateProfile(localId, { displayName: 'Local Renamed', username: 'local_user', bio: '' });
    assert.strictEqual(cleared.account.bio, null);

    const prefs = await store.updatePreferences(localId, { theme: 'system', language: 'fr', timeZone: '', notifications: { email: true, push: false, marketing: false } });
    assert.deepStrictEqual(prefs.preferences, { theme: 'system', language: 'fr', timeZone: '', notifications: { email: true, push: false, marketing: false } });

    console.log('Account foundation tests passed.');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
