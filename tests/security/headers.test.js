/**
 * Security Headers Test
 *
 * Validates the Helmet-based security headers on dashboard responses.
 * Contract mirrors tests/security/auth.test.js (authoritative):
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: SAMEORIGIN (frameguard sameorigin)
 *   - Referrer-Policy: no-referrer
 *   - Permissions-Policy present
 *   - Content-Security-Policy with default-src 'self' (global, incl. health)
 *   - X-Request-ID present
 *   - CORS is never a wildcard
 *
 *   node tests/security/headers.test.js
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3118';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;

const botClient = Object.assign(new EventEmitter(), {
    user: {
        id: '1', tag: 'Test#0001', username: 'Test',
        presence: { status: 'online', activities: [] },
        setPresence: () => {},
        displayAvatarURL: () => null,
    },
    ws: { ping: 1 }, uptime: 1000, commands: new Collection(),
    guilds: { cache: new Collection() },
    application: { owner: null, fetch: async () => {} },
});

function get(path) {
    return new Promise((resolve) => {
        const r = http.request(
            { hostname: '127.0.0.1', port: PORT, path, method: 'GET' },
            (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
            }
        );
        r.on('error', () => resolve({ status: 0, headers: {}, body: '' }));
        r.end();
    });
}

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
    if (ok) passed++;
    else failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
    console.log('Security Headers:\n');

    const srv = require('../../backend/src/server');
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    const res = await get('/api/health');
    const h = res.headers;

    check('health is reachable', res.status === 200, `${res.status}`);
    check('X-Content-Type-Options: nosniff', h['x-content-type-options'] === 'nosniff', `${h['x-content-type-options']}`);
    check('X-Frame-Options: SAMEORIGIN', h['x-frame-options'] === 'SAMEORIGIN', `${h['x-frame-options']}`);
    check('Referrer-Policy: no-referrer', h['referrer-policy'] === 'no-referrer', `${h['referrer-policy']}`);
    check('Permissions-Policy present', !!h['permissions-policy'], `${h['permissions-policy'] || 'missing'}`);
    check(
        'Content-Security-Policy with default-src',
        typeof h['content-security-policy'] === 'string' && h['content-security-policy'].includes('default-src'),
        (h['content-security-policy'] || 'missing').slice(0, 80)
    );
    check('X-Request-ID present', !!h['x-request-id'], `${h['x-request-id'] || 'missing'}`);
    check('CORS not set to wildcard', h['access-control-allow-origin'] !== '*');

    console.log(`\nSecurity headers checks: ${passed} passed, ${failed} failed.`);
    process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
});
