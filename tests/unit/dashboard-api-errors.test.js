const http = require('http');

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const routes = {
    '/403-json': [403, { error: 'Target has a role equal to or above yours', required: 'Moderator', yours: 'Viewer' }],
    '/403-system': [403, { error: 'Insufficient system access', code: 'SYSTEM_ROLE_REQUIRED', required: 'DEVELOPER', yours: 'NONE' }],
    '/403-empty': [403, ''],
    '/401-json': [401, { error: 'Session expired', code: 'SESSION_EXPIRED' }],
    '/401-empty': [401, ''],
    '/404-json': [404, { error: 'Server not found' }],
    '/429-json': [429, { error: 'Too many requests for this operation — slow down', code: 'RATE_LIMITED', retryAfter: 300 }],
    '/500-json': [500, { error: 'Internal server error', code: 'INTERNAL', requestId: 'abc123' }],
    '/500-html': [500, '<html><body>Bad Gateway</body></html>', 'text/html'],
};

(async () => {
    const { default: api } = await import('../../dashboard/src/api.js');

    const server = http.createServer((req, res) => {
        const route = routes[req.url];
        if (!route) { res.writeHead(404, {}).end(''); return; }
        const [status, body, type] = route;
        const payload = typeof body === 'string' ? body : JSON.stringify(body);
        res.writeHead(status, { 'Content-Type': type || 'application/json' }).end(payload);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const message = (promise) => promise.then(() => '<no rejection>', (err) => err.message);

    console.log('\nDashboard API client surfaces backend errors:\n');

    check('403 hierarchy message reaches the toast',
        (await message(api.get(`${base}/403-json`))) === 'Target has a role equal to or above yours');
    check('403 system-role message reaches the toast',
        (await message(api.get(`${base}/403-system`))) === 'Insufficient system access');
    check('403 without body keeps the generic label',
        (await message(api.get(`${base}/403-empty`))) === 'Permission denied.');
    check('401 session message reaches the toast',
        (await message(api.get(`${base}/401-json`))) === 'Session expired');
    check('401 without body keeps the generic label',
        (await message(api.get(`${base}/401-empty`))) === 'Not authenticated.');
    check('404 backend message reaches the toast',
        (await message(api.get(`${base}/404-json`))) === 'Server not found');
    check('429 rate-limit message reaches the toast',
        (await message(api.get(`${base}/429-json`))) === 'Too many requests for this operation — slow down');
    check('500 JSON keeps the sanitized server message',
        (await message(api.get(`${base}/500-json`))) === 'Internal server error');
    check('500 HTML keeps the generic label',
        (await message(api.get(`${base}/500-html`))) === 'Server error (500).');

    server.close();

    if (fails) { console.log(`\n${fails} CHECK(S) FAILED.`); process.exit(1); }
    console.log('\nAll dashboard API error checks passed.\n');
})().catch((err) => { console.error(err); process.exit(1); });
