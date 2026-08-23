const assert = require('assert');
const { AccountStore, ACCOUNT_SCHEMA_SQL, hashAccountToken } = require('../../database/accounts');

class TokenPool {
    constructor() {
        this.account = { id: '11111111-1111-4111-8111-111111111111', display_name: 'Test', username: 'tester', email: 'test@example.com', email_verified_at: null, status: 'active', created_at: new Date().toISOString() };
        this.tokens = new Map(); this.passwordHash = 'old'; this.sessionsDeleted = false;
    }
    query(sql, params = []) { return this.run(sql, params); }
    async connect() { return { query: (sql, params = []) => this.run(sql, params), release() {} }; }
    async run(sql, params) {
        const text = sql.trim();
        if (sql === ACCOUNT_SCHEMA_SQL || /^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
        if (/UPDATE account_email_tokens SET used_at = NOW\(\)\s+WHERE account_id/.test(sql)) {
            for (const token of this.tokens.values()) if (token.account_id === params[0] && token.purpose === params[1] && !token.used_at) token.used_at = new Date();
            return { rows: [] };
        }
        if (/INSERT INTO account_email_tokens/.test(sql)) {
            this.tokens.set(params[3], { account_id: params[1], purpose: params[2], expires_at: params[4], used_at: null });
            return { rows: [] };
        }
        if (/SELECT account_id FROM account_email_tokens/.test(sql)) {
            const row = this.tokens.get(params[0]);
            const purpose = sql.includes("'verify_email'") ? 'verify_email' : 'reset_password';
            return { rows: row && row.purpose === purpose && !row.used_at && row.expires_at > new Date() ? [{ account_id: row.account_id }] : [] };
        }
        if (/UPDATE account_email_tokens SET used_at = NOW\(\) WHERE token_hash/.test(sql)) { this.tokens.get(params[0]).used_at = new Date(); return { rows: [] }; }
        if (/UPDATE accounts SET email_verified_at/.test(sql)) { this.account.email_verified_at = new Date(); return { rows: [] }; }
        if (/LEFT JOIN account_identities/.test(sql)) return { rows: [{ ...this.account }] };
        if (/UPDATE account_credentials SET password_hash/.test(sql)) { this.passwordHash = params[0]; return { rows: [] }; }
        if (/DELETE FROM dashboard_sessions/.test(sql)) { this.sessionsDeleted = true; return { rows: [] }; }
        if (/INSERT INTO account_security_events/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected SQL: ${sql}`);
    }
}

(async () => {
    const pool = new TokenPool();
    const store = new AccountStore(pool);
    const verifyToken = await store.issueEmailToken(pool.account.id, 'verify_email', 60_000);
    assert(verifyToken.length >= 43);
    assert(!pool.tokens.has(verifyToken), 'plaintext token must never be stored');
    assert(pool.tokens.has(hashAccountToken(verifyToken)));
    const verified = await store.verifyEmailToken(verifyToken, 'req-1');
    assert.strictEqual(verified.emailVerified, true);
    assert.strictEqual(await store.verifyEmailToken(verifyToken, 'req-2'), null, 'verification token must be single-use');

    const resetToken = await store.issueEmailToken(pool.account.id, 'reset_password', 60_000);
    assert.strictEqual(await store.resetPasswordWithToken(resetToken, 'new-hash', 'req-3'), true);
    assert.strictEqual(pool.passwordHash, 'new-hash');
    assert.strictEqual(pool.sessionsDeleted, true);
    assert.strictEqual(await store.resetPasswordWithToken(resetToken, 'again', 'req-4'), false, 'reset token must be single-use');
    console.log('Account token lifecycle tests passed.');
})().catch(err => { console.error(err); process.exit(1); });
