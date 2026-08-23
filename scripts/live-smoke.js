const fs = require('fs');
const path = require('path');

const DEFAULT_URL = process.env.DEPLOYMENT_URL || 'https://discord-v1-jrip.onrender.com';
const DEFAULT_WAKE_TIMEOUT = 180_000;
const REQUEST_TIMEOUT = 20_000;

function parseArgs(argv) {
    const options = {
        url: DEFAULT_URL,
        expectRelease: null,
        wakeTimeout: DEFAULT_WAKE_TIMEOUT,
        allowDegraded: false,
        json: null,
    };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--allow-degraded') options.allowDegraded = true;
        else if (arg === '--url') options.url = argv[++index];
        else if (arg === '--expect-release') options.expectRelease = argv[++index];
        else if (arg === '--wake-timeout') options.wakeTimeout = Number(argv[++index]);
        else if (arg === '--json') options.json = argv[++index];
        else if (arg === '--help') options.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!Number.isFinite(options.wakeTimeout) || options.wakeTimeout < 1 || options.wakeTimeout > 600_000) {
        throw new Error('--wake-timeout must be between 1 and 600000 milliseconds');
    }
    const parsed = new URL(options.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--url must use http:// or https://');
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('--url must be a credential-free origin without query or fragment');
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    options.origin = parsed.origin;
    return options;
}

async function request(origin, pathname, { redirect = 'follow' } = {}) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(new URL(pathname, origin), {
            redirect,
            signal: controller.signal,
            headers: { Accept: 'application/json, text/html;q=0.9, */*;q=0.8' },
        });
        const body = await response.text();
        let json = null;
        try { json = JSON.parse(body); } catch { /* non-JSON is validated by each caller */ }
        return { response, body, json, durationMs: Date.now() - started };
    } finally {
        clearTimeout(timer);
    }
}

function containsSecretLikeValue(body) {
    const patterns = [
        /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i,
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
        /(?:DISCORD_TOKEN|CLIENT_SECRET|SESSION_SECRET|DEV_TOKEN)\s*[=:]\s*[^\s,}]+/i,
        /\bBot\s+[A-Za-z0-9._-]{24,}\b/,
    ];
    return patterns.some(pattern => pattern.test(body));
}

function safeStatusSnapshot(json) {
    return {
        release: json?.release ?? null,
        apiVersion: json?.apiVersion ?? null,
        status: json?.status ?? null,
        checks: json?.checks && typeof json.checks === 'object' ? {
            dashboardBuilt: json.checks.dashboardBuilt,
            databaseOnline: json.checks.databaseOnline,
            discordConfigured: json.checks.discordConfigured,
            oauthConfigured: json.checks.oauthConfigured,
            botOnline: json.checks.botOnline,
        } : null,
    };
}

function checkSecurityHeaders(response, { https, label }, addCheck) {
    const expected = [
        ['x-content-type-options', value => value.toLowerCase() === 'nosniff'],
        ['x-frame-options', value => value.toUpperCase() === 'SAMEORIGIN'],
        ['referrer-policy', value => value.length > 0],
        ['permissions-policy', value => value.length > 0],
        ['content-security-policy', value => value.includes("default-src 'self'") && value.includes('frame-ancestors')],
    ];
    if (https) expected.push(['strict-transport-security', value => /max-age=\d+/.test(value)]);
    for (const [name, valid] of expected) {
        const value = response.headers.get(name) || '';
        addCheck(`${label} header ${name}`, valid(value), value ? 'present' : 'missing');
    }
}

async function waitForHealth(origin, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    do {
        try {
            last = await request(origin, '/api/health');
            if (last.response.status === 200 && last.json?.ok === true) return last;
        } catch (err) {
            last = { error: err.message };
        }
        if (Date.now() >= deadline) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(2_000, Math.max(1, deadline - Date.now()))));
    } while (Date.now() <= deadline);
    const detail = last?.response
        ? `last status ${last.response.status}`
        : (last?.error || 'no response');
    throw new Error(`Liveness did not become ready within ${timeoutMs}ms (${detail})`);
}

async function runAcceptance(inputOptions = {}) {
    const options = {
        url: inputOptions.url || DEFAULT_URL,
        expectRelease: inputOptions.expectRelease || null,
        wakeTimeout: inputOptions.wakeTimeout || DEFAULT_WAKE_TIMEOUT,
        allowDegraded: !!inputOptions.allowDegraded,
        json: inputOptions.json || null,
    };
    const normalized = parseArgs([
        '--url', options.url,
        '--wake-timeout', String(options.wakeTimeout),
        ...(options.expectRelease ? ['--expect-release', options.expectRelease] : []),
        ...(options.allowDegraded ? ['--allow-degraded'] : []),
    ]);
    const checks = [];
    const addCheck = (name, pass, detail = '') => checks.push({ name, pass: !!pass, detail: String(detail || '') });
    const startedAt = new Date().toISOString();
    const https = normalized.origin.startsWith('https://');

    let health;
    try {
        health = await waitForHealth(normalized.origin, normalized.wakeTimeout);
        addCheck('liveness', true, `HTTP ${health.response.status} in ${health.durationMs}ms`);
        addCheck('health body contains no secret-like value', !containsSecretLikeValue(health.body));
        checkSecurityHeaders(health.response, { https, label: 'health' }, addCheck);
    } catch (err) {
        addCheck('liveness', false, err.message);
    }

    let status;
    try {
        status = await request(normalized.origin, '/api/v2/status');
        addCheck('V2 status HTTP contract', status.response.status === 200, `HTTP ${status.response.status}`);
        const snapshot = safeStatusSnapshot(status.json);
        addCheck('V2 status schema',
            ['ready', 'degraded'].includes(snapshot.status)
            && snapshot.apiVersion === 'v2'
            && snapshot.checks
            && Object.values(snapshot.checks).every(value => typeof value === 'boolean'),
        JSON.stringify(snapshot));
        if (normalized.expectRelease) {
            addCheck('expected V2 release', snapshot.release === normalized.expectRelease,
                `expected ${normalized.expectRelease}, received ${snapshot.release}`);
        }
        addCheck('V2 status contains no secret-like value', !containsSecretLikeValue(status.body));
    } catch (err) {
        addCheck('V2 status request', false, err.message);
    }

    let ready;
    try {
        ready = await request(normalized.origin, '/api/v2/ready');
        const allowedStatus = normalized.allowDegraded
            ? [200, 503].includes(ready.response.status)
            : ready.response.status === 200;
        addCheck('strict readiness HTTP contract', allowedStatus, `HTTP ${ready.response.status}`);
        const snapshot = safeStatusSnapshot(ready.json);
        if (normalized.allowDegraded) {
            addCheck('readiness schema in degraded-allowed mode',
                ['ready', 'degraded'].includes(snapshot.status), JSON.stringify(snapshot));
        } else {
            const required = snapshot.checks && [
                snapshot.checks.dashboardBuilt,
                snapshot.checks.databaseOnline,
                snapshot.checks.discordConfigured,
                snapshot.checks.oauthConfigured,
                snapshot.checks.botOnline,
            ];
            addCheck('all production services ready',
                snapshot.status === 'ready' && required?.every(value => value === true),
            JSON.stringify(snapshot));
        }
        addCheck('readiness body contains no secret-like value', !containsSecretLikeValue(ready.body));
    } catch (err) {
        addCheck('strict readiness request', false, err.message);
    }

    try {
        const auth = await request(normalized.origin, '/api/auth/status');
        addCheck('auth status HTTP contract', auth.response.status === 200 && auth.json,
            `HTTP ${auth.response.status}`);
        addCheck('auth status contains no secret-like value', !containsSecretLikeValue(auth.body));
        if (auth.json) {
            addCheck('auth status schema',
                typeof auth.json.loggedIn === 'boolean'
                && typeof auth.json.oauthEnabled === 'boolean'
                && typeof auth.json.authRequired === 'boolean'
                && typeof auth.json.databaseOnline === 'boolean');
            if (!normalized.allowDegraded) {
                addCheck('OAuth enabled', auth.json.oauthEnabled === true);
                addCheck('auth database online', auth.json.databaseOnline === true);
            }
            if (auth.json.redirectUri) {
                const redirect = new URL(auth.json.redirectUri);
                addCheck('OAuth redirect uses deployment origin', redirect.origin === normalized.origin,
                    redirect.origin);
            }
        }
    } catch (err) {
        addCheck('auth status request', false, err.message);
    }

    try {
        const root = await request(normalized.origin, '/');
        addCheck('Dashboard HTML', root.response.status === 200 && /<div id=["']root["']/.test(root.body),
            `HTTP ${root.response.status}`);
        checkSecurityHeaders(root.response, { https, label: 'Dashboard' }, addCheck);
        const assetMatches = [
            root.body.match(/<script[^>]+src=["']([^"']+\.js)["']/i)?.[1],
            root.body.match(/<link[^>]+href=["']([^"']+\.css)["']/i)?.[1],
        ].filter(Boolean);
        addCheck('Dashboard references JS and CSS assets', assetMatches.length === 2,
            assetMatches.join(', '));
        for (const asset of assetMatches) {
            const assetUrl = new URL(asset, normalized.origin);
            addCheck(`asset remains same-origin: ${assetUrl.pathname}`,
                assetUrl.origin === normalized.origin, assetUrl.origin);
            if (assetUrl.origin !== normalized.origin) continue;
            const response = await request(normalized.origin, assetUrl.pathname);
            const expectedType = assetUrl.pathname.endsWith('.js') ? /javascript/ : /css/;
            addCheck(`asset loads: ${assetUrl.pathname}`,
                response.response.status === 200
                && expectedType.test(response.response.headers.get('content-type') || ''),
            `HTTP ${response.response.status}`);
        }
    } catch (err) {
        addCheck('Dashboard request', false, err.message);
    }

    try {
        const unknown = await request(normalized.origin, '/api/__deployment_acceptance_unknown__');
        addCheck('unknown API route is JSON 404',
            unknown.response.status === 404
            && unknown.json
            && typeof unknown.json.error === 'string',
        `HTTP ${unknown.response.status}`);
    } catch (err) {
        addCheck('unknown API route request', false, err.message);
    }

    if (https) {
        try {
            const insecure = normalized.origin.replace(/^https:/, 'http:');
            const redirected = await request(insecure, '/api/health', { redirect: 'manual' });
            const location = redirected.response.headers.get('location');
            addCheck('HTTP redirects to HTTPS',
                [301, 302, 307, 308].includes(redirected.response.status)
                && !!location
                && new URL(location, insecure).protocol === 'https:',
            `HTTP ${redirected.response.status}`);
        } catch (err) {
            addCheck('HTTP to HTTPS redirect request', false, err.message);
        }
    }

    const report = {
        target: normalized.origin,
        mode: normalized.allowDegraded ? 'allow-degraded' : 'strict',
        expectedRelease: normalized.expectRelease,
        startedAt,
        finishedAt: new Date().toISOString(),
        success: checks.every(check => check.pass),
        summary: {
            passed: checks.filter(check => check.pass).length,
            failed: checks.filter(check => !check.pass).length,
        },
        observed: {
            health: health ? { status: health.response.status, durationMs: health.durationMs } : null,
            status: status ? safeStatusSnapshot(status.json) : null,
            readiness: ready ? safeStatusSnapshot(ready.json) : null,
        },
        checks,
    };
    return report;
}

function printReport(report) {
    console.log(`\nDeployment acceptance: ${report.target} (${report.mode})\n`);
    for (const check of report.checks) {
        console.log(`  ${check.pass ? 'PASS' : 'FAIL'}  ${check.name}${check.detail ? `  ${check.detail}` : ''}`);
    }
    console.log(`\n${report.summary.passed} passed, ${report.summary.failed} failed.\n`);
}

function help() {
    console.log(`Usage: node scripts/live-smoke.js [options]\n
Options:
  --url <origin>              Deployment origin (default: ${DEFAULT_URL})
  --expect-release <version>  Require the V2 release value
  --wake-timeout <ms>         Cold-start allowance, 1-600000 (default: 180000)
  --allow-degraded            Accept 503 readiness and offline integrations
  --json <path>               Write a sanitized JSON report
  --help                      Show this help
`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return help();
    const report = await runAcceptance(options);
    printReport(report);
    if (options.json) {
        const output = path.resolve(options.json);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
        console.log(`Sanitized report written to ${output}\n`);
    }
    process.exit(report.success ? 0 : 1);
}

if (require.main === module) {
    main().catch(err => {
        console.error(`Deployment acceptance failed: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { parseArgs, runAcceptance, containsSecretLikeValue, safeStatusSnapshot };
