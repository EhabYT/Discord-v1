const assert = require('assert');
const { dashboardOrigin, escapeHtml, sendAccountEmail } = require('../../shared/services/account-mail');
const { hashAccountToken, ACCOUNT_SCHEMA_SQL } = require('../../database/accounts');

(async () => {
    const previous = { ...process.env };
    process.env.DASHBOARD_URL = 'https://dashboard.example/path';
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'EB <accounts@example.com>';
    assert.strictEqual(dashboardOrigin(), 'https://dashboard.example');
    process.env.DASHBOARD_URL = 'https://user:pass@dashboard.example';
    assert.strictEqual(dashboardOrigin(), null, 'configured origins must reject embedded credentials');
    assert.strictEqual(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
    const result = await sendAccountEmail({
        to: 'person@example.com', subject: 'test', title: 'test', message: 'test',
        actionLabel: 'go', actionPath: '/verify-email?token=not-a-real-token',
    });
    assert.deepStrictEqual(result, { sent: false, reason: 'not_configured' });
    assert.strictEqual(await hashAccountToken('token'), await hashAccountToken('token'));
    assert.notStrictEqual(await hashAccountToken('token'), await hashAccountToken('other'));
    assert((await hashAccountToken('token')).startsWith('$argon2id$'));
    assert.match(ACCOUNT_SCHEMA_SQL, /account_email_tokens/);
    assert.match(ACCOUNT_SCHEMA_SQL, /purpose IN \('verify_email', 'reset_password'\)/);
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    console.log('Account email and token policy tests passed.');
})().catch(err => { console.error(err); process.exit(1); });
