const assert = require('assert');
const { AccountStore, ACCOUNT_SCHEMA_SQL } = require('../../database/accounts');

class MfaPool {
    constructor() { this.lastStep = null; this.recovery = new Map([['hash-one', false]]); }
    async query(sql, params = []) {
        if (sql === ACCOUNT_SCHEMA_SQL) return { rows: [] };
        if (/UPDATE account_mfa_totp SET last_used_step/.test(sql)) {
            if (this.lastStep == null || this.lastStep < params[0]) { this.lastStep = params[0]; return { rows: [{ account_id: params[1] }] }; }
            return { rows: [] };
        }
        if (/UPDATE account_recovery_codes SET used_at/.test(sql)) {
            if (this.recovery.get(params[1]) === false) { this.recovery.set(params[1], true); return { rows: [{ id: 'code-id' }] }; }
            return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    }
}

(async () => {
    const store = new AccountStore(new MfaPool());
    assert.strictEqual(await store.claimTotpStep('account', 100), true);
    assert.strictEqual(await store.claimTotpStep('account', 100), false, 'same TOTP step must not replay');
    assert.strictEqual(await store.claimTotpStep('account', 99), false, 'older TOTP step must not replay');
    assert.strictEqual(await store.claimTotpStep('account', 101), true);
    assert.strictEqual(await store.consumeRecoveryCode('account', 'hash-one'), true);
    assert.strictEqual(await store.consumeRecoveryCode('account', 'hash-one'), false, 'recovery code must be single-use');
    assert.strictEqual(await store.consumeRecoveryCode('account', 'unknown'), false);
    console.log('Account MFA replay and recovery-store tests passed.');
})().catch(err => { console.error(err); process.exit(1); });
