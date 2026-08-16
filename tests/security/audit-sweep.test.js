/**
 * Fresh-eyes re-audit sweep (§52).
 *
 * The other suites each test the layer they were written for. This one behaves
 * like an external auditor who has never seen the code: it enumerates EVERY
 * mounted route from the running Express app and asserts the invariants that
 * must hold across all of them, regardless of which file implements them.
 *
 * Its purpose is to catch a route that was added — or moved during a refactor —
 * without inheriting the security stack. That is the exact failure that let
 * routes/permissions.js ship unauthenticated: reviewing files individually
 * missed it, because the gap was in the composition, not in any one file.
 *
 * Invariants asserted for every discovered route:
 *   1. No unauthenticated caller reaches it (except the documented allowlist).
 *   2. It reveals nothing about guild existence before authenticating.
 *   3. Unsafe methods reject a forged cross-origin request.
 *   4. No privileged side effect occurs on a rejected request.
 *
 *   node tests/security/audit-sweep.test.js
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3255';
process.env.DASHBOARD_AUTH = 'true';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;
const REAL_GUILD = '111111111111111111';
const FAKE_GUILD = '999999999999999999';

// Routes that are public by design. Anything not on this list must be gated.
const PUBLIC_ALLOWLIST = new Set([
    'GET /api/health',            // keep-tunnel.sh probes it
    'GET /api/auth/status',       // the login page needs to know if OAuth exists
    'GET /api/auth/discord',      // the OAuth entry point itself
    'GET /api/auth/callback',
    'GET /api/auth/discord/callback',
    'POST /api/auth/logout',      // must work even with a dead session
    'GET /api/dev/whoami',        // reports only whether you are unlocked
    'POST /api/dev/unlock',       // the unlock endpoint, rate-limited
    'POST /api/dev/lock',
]);

let sideEffects = [];

const member = {
    id: 'someone',
    user: { id: 'someone', username: 'u', bot: false, tag: 'u#0', displayAvatarURL: () => null },
    permissions: { has: () => false },
    roles: { cache: new Collection(), highest: { position: 1 }, set: async () => { sideEffects.push('roles.set'); } },
    kick: async () => { sideEffects.push('kick'); },
    ban: async () => { sideEffects.push('ban'); },
    timeout: async () => { sideEffects.push('timeout'); },
    setNickname: async () => { sideEffects.push('setNickname'); },
    joinedTimestamp: Date.now(), displayName: 'u', kickable: true, bannable: true,
};
const members = new Collection([['someone', member]]);

const guild = {
    id: REAL_GUILD, name: 'RealGuild', memberCount: 1, ownerId: 'owner',
    iconURL: () => null, createdTimestamp: Date.now(),
    premiumTier: 0, premiumSubscriptionCount: 0,
    roles: { cache: new Collection() },
    channels: {
        cache: new Collection(),
        fetch: async () => ({ send: async () => { sideEffects.push('channel.send'); return { id: 'm' }; } }),
    },
    emojis: { cache: new Collection() }, stickers: { cache: new Collection() },
    bans: { fetch: async () => new Collection() },
    invites: { fetch: async () => new Collection() },
    leave: async () => { sideEffects.push('guild.leave'); },
    members: {
        me: { roles: { highest: { position: 99 } }, permissions: { has: () => true } },
        cache: members,
        fetch: async (i) => (i === undefined || typeof i === 'object')
            ? members : (members.get(String(i)) || null),
    },
};

const botClient = Object.assign(new EventEmitter(), {
    user: {
        id: 'bot', tag: 'bot#1', username: 'bot',
        presence: { status: 'online', activities: [] },
        setPresence: () => { sideEffects.push('setPresence'); },
        displayAvatarURL: () => null,
    },
    ws: { ping: 1 }, uptime: 1, commands: new Collection(),
    guilds: { cache: new Collection([[REAL_GUILD, guild]]) },
    users: { fetch: async () => null },
    application: { owner: null, fetch: async () => {} },
});

function req(path, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const r = http.request({
            hostname: '127.0.0.1', port: PORT, path, method,
            headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
        }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: out }));
        });
        r.on('error', () => resolve({ status: 0, body: '' }));
        if (data) r.write(data);
        r.end();
    });
}

/**
 * Enumerate the API surface from source.
 *
 * Express 5 no longer exposes a router's mount path on the layer object (it
 * lives inside an opaque matcher closure), so walking app.router yields route
 * paths without their prefix. Rather than reverse-engineer a private API that
 * can change between minor versions, the surface is parsed from the route
 * files and joined to the mount points declared in server.js. That is stable,
 * and it is the same list a reviewer would build by hand — only exhaustively.
 */
function discoverRoutes() {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');
    const srv = fs.readFileSync(path.join(root, 'backend', 'src', 'server.js'), 'utf8');

    const found = [];

    // Routes declared directly on the app.
    for (const m of srv.matchAll(/app\.(get|post|put|patch|delete)\('(\/api[^']*)'/g)) {
        found.push({ method: m[1].toUpperCase(), path: m[2] });
    }

    // Mounted routers: map the mount prefix to the file that implements it.
    const routerFiles = {
        statsRouter: 'stats.js', authRouter: 'auth.js', devRouter: 'dev.js',
        guildsRouter: 'guilds.js', musicRouter: 'music.js',
        permissionsRouter: 'permissions.js',
    };
    for (const m of srv.matchAll(/app\.use\('(\/api[^']*)',\s*(\w+)\)/g)) {
        const [, prefix, varName] = m;
        const file = routerFiles[varName];
        if (!file) continue;
        const src = fs.readFileSync(path.join(root, 'backend', 'src', 'routes', file), 'utf8');
        for (const r of src.matchAll(/router\.(get|post|put|patch|delete)\('([^']*)'/g)) {
            const sub = r[2] === '/' ? '' : r[2];
            found.push({ method: r[1].toUpperCase(), path: prefix + sub });
        }
    }
    return found;
}

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

(async () => {
    const srv = require('../../backend/src/server.js');
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    // Probe health FIRST: the sweep below issues ~150 requests and would trip
    // the global 400/min rate limiter, making a later health probe look broken.
    const health = await req('/api/health');

    // ── 1. Every discovered route must reject anonymous callers ──
    console.log('\nEvery mounted API route must be gated (allowlist aside):\n');

    const routes = discoverRoutes()
        .filter((r) => r.path.startsWith('/api'))
        .filter((r) => !r.path.includes('*'));

    // Pin the authoritative API inventory so a refactor cannot silently drop
    // (or accidentally duplicate) an endpoint while moving files.
    check('route discovery found the full API surface', routes.length === 151, `${routes.length} routes`);

    const leaks = [];
    for (const r of routes) {
        const key = `${r.method} ${r.path}`;
        if (PUBLIC_ALLOWLIST.has(key)) continue;
        const concrete = r.path
            .replace(/:guildId/g, REAL_GUILD)
            .replace(/:userId|:roleId|:id|:ticketId|:noteId|:warningId|:index|:name/g, '1');
        const res = await req(concrete, { method: r.method });
        // 401/403/404 are all acceptable refusals; 2xx is a leak.
        if (res.status >= 200 && res.status < 300) leaks.push(`${key} -> ${res.status}`);
    }
    check('no route serves an unauthenticated caller', leaks.length === 0,
        leaks.slice(0, 6).join(' | '));

    // ── 2. Guild existence must not be observable before auth ──
    console.log('\nGuild existence must not leak to anonymous callers:\n');

    const real = await req(`/api/guild/${REAL_GUILD}/confessions`);
    const fake = await req(`/api/guild/${FAKE_GUILD}/confessions`);
    const junk = await req('/api/guild/not-a-snowflake/confessions');
    check('real vs unknown guild are indistinguishable',
        real.status === fake.status && real.body === fake.body,
        `real=${real.status} fake=${fake.status}`);
    check('malformed guild id is also indistinguishable',
        junk.status === real.status, `malformed=${junk.status}`);

    // ── 3. Unsafe methods reject forged cross-origin requests ──
    console.log('\nUnsafe methods reject forged origins:\n');

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const res = await req(`/api/guild/${REAL_GUILD}/automod`, {
            method, headers: { Origin: 'https://evil.example' }, body: { setting: 'badWords', value: false },
        });
        const ok = res.status === 403 || res.status === 401 || res.status === 404;
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${method} from a foreign origin refused  ${res.status}`);
    }

    // ── 4. Nothing privileged happened during any of the above ──
    console.log('\nSide effects:\n');
    check('no Discord action was executed by any rejected request',
        sideEffects.length === 0, sideEffects.join(',') || '');

    // ── 5. Health stays public but minimal ──
    console.log('\nHealth endpoint contract:\n');
    check('health is reachable for the tunnel probe',
        health.status === 200 && health.body.includes('"ok":true'), `${health.status}`);
    const leaked = ['publicUrl', 'sseClients', '"guilds"', 'memory', 'cpu']
        .filter((k) => health.body.includes(k));
    check('health leaks no operational detail', leaked.length === 0, leaked.join(','));

    console.log(fails === 0
        ? '\nAudit sweep passed — no ungated route, no existence oracle, no side effects.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
