const assert = require('assert');
const http = require('http');
const { runAcceptance, parseArgs } = require('../../scripts/live-smoke');

const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self'",
};

function startFixture(overrides = {}) {
    const state = {
        degraded: false,
        missingV2: false,
        missingHeaders: false,
        externalAsset: false,
        release: '2.0.0',
        secretBody: false,
        ...overrides,
    };
    const server = http.createServer((req, res) => {
        if (!state.missingHeaders) {
            for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
        }
        const sendJson = (status, body) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
        };
        if (req.url === '/api/health') return sendJson(200, { ok: true, botOnline: !state.degraded });
        if (req.url === '/api/v2/status' || req.url === '/api/v2/ready') {
            if (state.missingV2) return sendJson(404, { error: `Unknown API route GET ${req.url}` });
            const ready = !state.degraded;
            const body = {
                release: state.release,
                apiVersion: 'v2',
                status: ready ? 'ready' : 'degraded',
                checks: {
                    dashboardBuilt: true,
                    databaseOnline: ready,
                    discordConfigured: ready,
                    oauthConfigured: ready,
                    botOnline: ready,
                },
                databaseError: state.secretBody
                    ? 'postgresql://user:super-secret@database.example/postgres'
                    : (ready ? null : 'Database unavailable'),
            };
            return sendJson(req.url.endsWith('/ready') && !ready ? 503 : 200, body);
        }
        if (req.url === '/api/auth/status') {
            return sendJson(200, {
                loggedIn: false,
                oauthEnabled: !state.degraded,
                databaseOnline: !state.degraded,
                authRequired: true,
                redirectUri: `http://127.0.0.1:${server.address().port}/api/auth/discord/callback`,
            });
        }
        if (req.url === '/') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            const js = state.externalAsset ? 'https://evil.example/app.js' : '/assets/app.js';
            return res.end(`<div id="root"></div><script type="module" src="${js}"></script><link rel="stylesheet" href="/assets/app.css">`);
        }
        if (req.url === '/assets/app.js') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            return res.end('console.log("ok")');
        }
        if (req.url === '/assets/app.css') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            return res.end('body{color:white}');
        }
        return sendJson(404, { error: `Unknown API route GET ${req.url}` });
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => resolve({
            server,
            url: `http://127.0.0.1:${server.address().port}`,
        }));
    });
}

async function withFixture(overrides, fn) {
    const fixture = await startFixture(overrides);
    try {
        return await fn(fixture.url);
    } finally {
        await new Promise(resolve => fixture.server.close(resolve));
    }
}

(async () => {
    console.log('\nDeployment acceptance smoke tool:\n');

    assert.throws(() => parseArgs(['--url', 'https://user:pass@example.com']), /credential-free/);
    assert.throws(() => parseArgs(['--wake-timeout', '0']), /between 1 and 600000/);

    await withFixture({}, async url => {
        const report = await runAcceptance({ url, expectRelease: '2.0.0', wakeTimeout: 500 });
        assert.strictEqual(report.success, true, JSON.stringify(report.checks.filter(check => !check.pass)));
    });
    console.log('  PASS  strict-ready deployment is accepted');

    await withFixture({ degraded: true }, async url => {
        const allowed = await runAcceptance({ url, expectRelease: '2.0.0', wakeTimeout: 500, allowDegraded: true });
        const strict = await runAcceptance({ url, expectRelease: '2.0.0', wakeTimeout: 500 });
        assert.strictEqual(allowed.success, true);
        assert.strictEqual(strict.success, false);
        assert(strict.checks.some(check => check.name === 'all production services ready' && !check.pass));
    });
    console.log('  PASS  degraded deployment is accepted only in preflight mode');

    await withFixture({ missingV2: true }, async url => {
        const report = await runAcceptance({ url, wakeTimeout: 500, allowDegraded: true });
        assert.strictEqual(report.success, false);
        assert(report.checks.some(check => check.name === 'V2 status HTTP contract' && !check.pass));
    });
    console.log('  PASS  missing V2 routes are rejected');

    await withFixture({ missingHeaders: true }, async url => {
        const report = await runAcceptance({ url, wakeTimeout: 500 });
        assert.strictEqual(report.success, false);
        assert(report.checks.some(check => check.name.includes('content-security-policy') && !check.pass));
    });
    console.log('  PASS  missing security headers are rejected');

    await withFixture({ externalAsset: true }, async url => {
        const report = await runAcceptance({ url, wakeTimeout: 500 });
        assert.strictEqual(report.success, false);
        assert(report.checks.some(check => check.name.startsWith('asset remains same-origin') && !check.pass));
    });
    console.log('  PASS  cross-origin Dashboard assets are rejected');

    await withFixture({ release: '1.0.0' }, async url => {
        const report = await runAcceptance({ url, expectRelease: '2.0.0', wakeTimeout: 500 });
        assert.strictEqual(report.success, false);
        assert(report.checks.some(check => check.name === 'expected V2 release' && !check.pass));
    });
    console.log('  PASS  release mismatches are rejected');

    await withFixture({ secretBody: true }, async url => {
        const report = await runAcceptance({ url, wakeTimeout: 500 });
        assert.strictEqual(report.success, false);
        assert(report.checks.some(check => check.name === 'V2 status contains no secret-like value' && !check.pass));
        assert(!JSON.stringify(report).includes('super-secret'), 'sanitized report must not retain response secrets');
    });
    console.log('  PASS  secret-like responses fail without entering the report');

    console.log('\nAll deployment acceptance smoke checks passed.\n');
    process.exit(0);
})().catch(err => {
    console.error(err);
    process.exit(1);
});
