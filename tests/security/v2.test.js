const { systemSnapshot, RELEASE } = require('../../backend/src/routes/v2');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

(async () => {
    console.log('\nV2 system contract:\n');
    const snapshot = await systemSnapshot({ user: null, isReady: () => false });
    check('release and bot configuration are explicitly versioned',
        RELEASE === '2.0.0' && snapshot.apiVersion === 'v2'
        && snapshot.configuration.schemaVersion === 2 && snapshot.configuration.version === '2.0.0');
    check('readiness has a stable machine-readable state', ['ready', 'degraded'].includes(snapshot.status));
    check('capabilities advertise bilingual RTL support',
        snapshot.capabilities.rtl === true && snapshot.capabilities.bilingual.includes('ar'));
    check('status contains no environment secret values',
        !JSON.stringify(snapshot).includes(String(process.env.DISCORD_TOKEN || 'never-present-secret')));
    check('dashboard build is detected', snapshot.checks.dashboardBuilt === true);

    console.log(fails === 0 ? '\nAll V2 contract checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
