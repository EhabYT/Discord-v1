/**
 * Regression test for dashboard authentication.
 *
 * Verifies the dashboard fails CLOSED: with no session, every /api/* route
 * must return 401 — except /api/health, which keep-tunnel.sh probes.
 *
 *   node tests/security/auth.test.js
 *
 * Exits non-zero on any leak, so it can gate a deploy.
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3111';
delete process.env.DASHBOARD_AUTH;          // simulate the old unsafe default

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;

let presenceChanged = false;

const member = {
    id: '42',
    user: { id: '42', username: 'T42', bot: false, tag: 'T42#0', displayAvatarURL: () => null },
    permissions: { has: () => true },
    roles: { cache: new Collection() },
    joinedTimestamp: Date.now(),
    displayName: 'T42',
};

const guild = {
    id: '999999999999999999', name: 'TestGuild', memberCount: 5, ownerId: '0',
    iconURL: () => null, createdTimestamp: Date.now(),
    premiumTier: 0, premiumSubscriptionCount: 0,
    roles: { cache: new Collection() }, channels: { cache: new Collection() },
    emojis: { cache: new Collection() }, stickers: { cache: new Collection() },
    bans: { fetch: async () => new Collection() },
    invites: { fetch: async () => new Collection() },
    members: {
        me: { permissions: { has: () => true } },
        cache: new Collection([['42', member]]),
        fetch: async (id) => (id === undefined || typeof id === 'object')
            ? new Collection([['42', member]])
            : (String(id) === '42' ? member : null),
    },
};

const botClient = Object.assign(new EventEmitter(), {
    user: {
        id: '1', tag: 'Test#0001', username: 'Test',
        presence: { status: 'online', activities: [] },
        setPresence: () => { presenceChanged = true; },
        displayAvatarURL: () => null,
    },
    ws: { ping: 1 }, uptime: 1000, commands: new Collection(),
    guilds: { cache: new Collection([['999999999999999999', guild]]) },
    application: { owner: null, fetch: async () => {} },
});

function req(path, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const r = http.request(
            { hostname: '127.0.0.1', port: PORT, path, method,
              headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } },
            (res) => {
                let out = '';
                res.on('data', (c) => { out += c; });
                res.on('end', () => resolve({ status: res.statusCode, body: out }));
            }
        );
        r.on('error', () => resolve({ status: 0, body: '' }));
        if (data) r.write(data);
        r.end();
    });
}

// Routes that must be locked down when there is no session.
const MUST_401 = [
    ['GET',    '/api/guilds'],
    ['GET',    '/api/me'],
    ['GET',    '/api/stats'],
    ['GET',    '/api/performance'],
    ['GET',    '/api/analytics/global'],
    ['GET',    '/api/bot/presence'],
    ['POST',   '/api/bot/presence', { status: 'dnd', activityText: 'PWNED' }],
    ['GET',    '/api/events/stream'],
    ['GET',    '/api/guild/999999999999999999'],
    ['GET',    '/api/guild/999999999999999999/leaderboard'],
    ['GET',    '/api/music/999999999999999999'],
    ['POST',   '/api/guild/999999999999999999/automod', { setting: 'badWords', value: false }],
    ['POST',   '/api/guild/999999999999999999/members/42/action', { action: 'ban' }],
    ['POST',   '/api/guild/999999999999999999/leave', {}],
    ['DELETE', '/api/guild/999999999999999999/warnings'],
];

(async () => {
    require('../../backend/src/server.js').startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    let failures = 0;
    console.log('\nAnonymous requests — expect 401 on every route:\n');
    for (const [method, path, body] of MUST_401) {
        const res = await req(path, { method, body });
        const ok = res.status === 401;
        if (!ok) failures++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${method.padEnd(6)} ${path.padEnd(38)} ${res.status}`);
    }

    console.log('\nHealth endpoint — public, but must not leak operational detail:\n');
    const health = await req('/api/health');
    const hOk = health.status === 200 && health.body.includes('"ok":true');
    if (!hOk) failures++;
    console.log(`  ${hOk ? 'PASS' : 'FAIL'}  GET    /api/health                            ${health.status}`);
    const leaks = ['publicUrl', 'sseClients', '"guilds"'].filter((k) => health.body.includes(k));
    if (leaks.length) { failures++; console.log(`  FAIL  health leaks to anonymous: ${leaks.join(', ')}`); }
    else console.log('  PASS  no guild count / SSE count / public URL in anonymous health');

    console.log('\nForged proxy headers must not unlock the localhost bypass:\n');
    for (const h of [{ 'X-Forwarded-For': '1.2.3.4' }, { 'X-Forwarded-Host': 'evil.com' }]) {
        const res = await req('/api/guilds', { headers: h });
        const ok = res.status === 401;
        if (!ok) failures++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  GET    /api/guilds  ${JSON.stringify(h).padEnd(34)} ${res.status}`);
    }

    console.log('\nSide effects:\n');
    if (presenceChanged) { failures++; console.log('  FAIL  bot presence was changed by an anonymous caller'); }
    else console.log('  PASS  no privileged action executed anonymously');

    console.log(failures === 0
        ? '\nAll authentication checks passed.\n'
        : `\n${failures} CHECK(S) FAILED — dashboard is not safe to expose.\n`);
    process.exit(failures === 0 ? 0 : 1);
})();
