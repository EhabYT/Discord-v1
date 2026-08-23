const assert = require('assert');
const { AccountStore, normalizeUsername, ACCOUNT_SCHEMA_SQL } = require('../../database/accounts');

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
            const identity = this.identities.get(String(params[0]));
            const account = identity && this.accounts.get(identity.account_id);
            return { rows: account ? [{ ...account, ...identity }] : [] };
        }
        if (/LEFT JOIN account_identities/.test(sql)) {
            const account = this.accounts.get(String(params[0]));
            const identity = [...this.identities.values()].find(item => item.account_id === params[0]);
            return { rows: account ? [{ ...account, ...(identity || {}) }] : [] };
        }
        if (/SELECT account_id FROM account_identities/.test(sql)) {
            const identity = this.identities.get(String(params[0]));
            return { rows: identity ? [{ account_id: identity.account_id }] : [] };
        }
        if (/SELECT 1 FROM accounts/.test(sql)) {
            return { rows: [...this.accounts.values()].some(a => a.username.toLowerCase() === params[0].toLowerCase()) ? [{ '?column?': 1 }] : [] };
        }
        if (/INSERT INTO accounts/.test(sql)) {
            this.accounts.set(params[0], {
                id: params[0], display_name: params[1], username: params[2], avatar_url: params[3],
                email: null, email_verified_at: null, status: 'active', created_at: new Date().toISOString(),
            });
            return { rows: [] };
        }
        if (/INSERT INTO account_identities/.test(sql)) {
            this.identities.set(String(params[1]), {
                account_id: params[0], provider_user_id: String(params[1]),
                provider_username: params[2], provider_avatar_url: params[3],
            });
            return { rows: [] };
        }
        if (/UPDATE account_identities/.test(sql)) {
            const identity = this.identities.get(String(params[2]));
            identity.provider_username = params[0];
            identity.provider_avatar_url = params[1];
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
    assert.strictEqual(pool.events.length, 2, 'explicit linking creates one security event');
    assert.strictEqual(pool.releases, 4, 'transaction clients must always release');

    console.log('Account foundation tests passed.');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
