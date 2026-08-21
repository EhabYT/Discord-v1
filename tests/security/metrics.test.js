const {
    observe, metricsSnapshot, normalizedPath, resetForTests, closeMetrics,
} = require('../../backend/src/metrics');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

console.log('\nBackend performance metrics:\n');
resetForTests();
check('path normalization removes Discord snowflakes',
    normalizedPath({ path: '/api/guild/123456789012345678/members/987654321098765432' })
        === '/api/guild/:snowflake/members/:snowflake');
observe('GET', '/api/health', 200, 5);
observe('GET', '/api/health', 500, 25);
observe('POST', '/api/auth', 401, 10);
observe('POST', '/api/action', 403, 15);
observe('POST', '/api/action', 429, 20);
const snapshot = metricsSnapshot();
check('request and status counters are accurate',
    snapshot.requests.total === 5
    && snapshot.requests.errors === 1
    && snapshot.requests.authFailures === 1
    && snapshot.requests.forbidden === 1
    && snapshot.requests.rateLimited === 1);
check('latency percentiles are computed',
    snapshot.requests.p50LatencyMs === 15 && snapshot.requests.p95LatencyMs === 25);
check('endpoint metrics are aggregated without IDs',
    snapshot.requests.paths.find((row) => row.path === '/api/health')?.requests === 2);
check('process metrics expose no environment values',
    !JSON.stringify(snapshot).includes(String(process.env.DATABASE_URL || 'not-a-real-secret')));
closeMetrics();
console.log(fails === 0 ? '\nAll metrics checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
process.exit(fails === 0 ? 0 : 1);
