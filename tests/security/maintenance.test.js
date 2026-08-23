const { db } = require('../../database/index');
const { maintenanceGuard, invalidateMaintenanceCache } = require('../../backend/src/middleware/maintenance');

const originalSupport = process.env.SUPPORT_IDS;
process.env.SUPPORT_IDS = '333333333333333333';
const guard = maintenanceGuard(null);

function run(req) {
    return new Promise((resolve) => {
        const headers = {};
        const res = {
            setHeader(key, value) { headers[key] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ passed: false, status: this.statusCode, body, headers }); return this; },
        };
        Promise.resolve(guard(req, res, () => resolve({ passed: true, headers }))).catch((err) => resolve({ error: err }));
    });
}

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

(async () => {
    console.log('\nBackend-enforced maintenance mode:\n');
    await db.set('dev_flags', {
        maintenance: true,
        maintenanceMessage: 'Planned work',
        maintenanceUntil: Date.now() + 60_000,
    });
    invalidateMaintenanceCache();
    const ordinary = await run({ originalUrl: '/api/guilds', session: { user: { id: '444444444444444444' } } });
    check('ordinary API request is blocked server-side',
        ordinary.status === 503 && ordinary.body.code === 'MAINTENANCE' && ordinary.body.error === 'Planned work');
    check('maintenance response includes Retry-After', Number(ordinary.headers['Retry-After']) > 0);

    const health = await run({ originalUrl: '/api/health', session: {} });
    check('health endpoint remains available', health.passed === true);
    const support = await run({
        originalUrl: '/api/guilds',
        session: { user: { id: '333333333333333333' }, account: { id: 'support-account', mfaEnabled: true } },
        socket: { remoteAddress: '127.0.0.1' }, headers: {},
    });
    check('system SUPPORT role bypasses maintenance for diagnostics', support.passed === true);

    await db.set('dev_flags', { maintenance: true, maintenanceUntil: Date.now() - 1 });
    invalidateMaintenanceCache();
    const expired = await run({ originalUrl: '/api/guilds', session: { user: { id: '444444444444444444' } } });
    check('expired maintenance ends automatically', expired.passed === true);

    await db.delete('dev_flags');
    if (originalSupport === undefined) delete process.env.SUPPORT_IDS;
    else process.env.SUPPORT_IDS = originalSupport;
    console.log(fails === 0 ? '\nAll maintenance checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
