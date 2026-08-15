/**
 * Regression tests for centralised API error handling (Phase 3).
 *
 * Before this, 128 route handlers each ended with:
 *
 *     catch (err) { res.status(500).json({ error: err.message }); }
 *
 * `err.message` was returned verbatim. Verified leaks included
 * `ENOENT: no such file or directory, open '/srv/app/secret.json'` — an
 * absolute filesystem path handed to any API client — and internal TypeErrors
 * exposing code structure. There was also no way to correlate a 500 seen in the
 * browser with the stack trace in the logs.
 *
 * These tests assert the new behaviour AND that existing, deliberate status
 * codes (400/403/404) were not swallowed by the migration.
 *
 *   node tests/security/errors.test.js
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3244';
process.env.DASHBOARD_AUTH = 'true';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');
const { classify, ApiError, badRequest } = require('../../backend/src/middleware/errors');

const PORT = process.env.DASHBOARD_PORT;
const GUILD = '111111111111111111';

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

const member = {
    id: 'admin',
    user: { id: 'admin', username: 'admin', bot: false, tag: 'admin#0', displayAvatarURL: () => null },
    permissions: { has: () => true },
    roles: { cache: new Collection(), highest: { position: 20 }, set: async () => {} },
    joinedTimestamp: Date.now(), displayName: 'admin',
};
const members = new Collection([['admin', member]]);

const guild = {
    id: GUILD, name: 'G', memberCount: 1, ownerId: 'nobody',
    iconURL: () => null, createdTimestamp: Date.now(),
    premiumTier: 0, premiumSubscriptionCount: 0,
    roles: { cache: new Collection() }, channels: { cache: new Collection() },
    emojis: { cache: new Collection() }, stickers: { cache: new Collection() },
    bans: { fetch: async () => new Collection() },
    invites: { fetch: async () => new Collection() },
    members: {
        me: { roles: { highest: { position: 50 } }, permissions: { has: () => true } },
        cache: members,
        fetch: async (i) => (i === undefined || typeof i === 'object')
            ? members : (members.get(String(i)) || null),
    },
};

const botClient = Object.assign(new EventEmitter(), {
    user: { id: 'bot', tag: 'b#1', username: 'b', presence: { status: 'online', activities: [] },
            setPresence: () => {}, displayAvatarURL: () => null },
    ws: { ping: 1 }, uptime: 1, commands: new Collection(),
    guilds: { cache: new Collection([[GUILD, guild]]) },
    application: { owner: null, fetch: async () => {} },
});

function req(path, { method = 'GET', body, cookie } = {}) {
    return new Promise((resolve) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const r = http.request({
            hostname: '127.0.0.1', port: PORT, path, method,
            headers: { ...(data ? { 'Content-Type': 'application/json' } : {}),
                       ...(cookie ? { Cookie: cookie } : {}) },
        }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
        });
        r.on('error', () => resolve({ status: 0, body: '' }));
        if (data) r.write(data);
        r.end();
    });
}

(async () => {
    console.log('\nClassification must not echo internals back to clients:\n');

    const leaky = Object.assign(
        new Error("ENOENT: no such file or directory, open '/srv/app/secret.json'"),
        { code: 'ENOENT' });
    let c = classify(leaky);
    check('fs path is not exposed', c.status === 500 && !/srv|secret\.json/.test(c.message),
        JSON.stringify(c.message));

    c = classify(new TypeError("Cannot read properties of null (reading 'token')"));
    check('internal TypeError is not exposed', !/token|properties/.test(c.message),
        JSON.stringify(c.message));

    console.log('\nActionable Discord errors are still surfaced:\n');

    for (const [code, status, needle] of [
        [50013, 403, 'missing permissions'],
        [50001, 403, 'cannot access'],
        [10007, 404, 'Unknown member'],
        [10011, 404, 'Unknown role'],
    ]) {
        const r = classify(Object.assign(new Error('x'), { code }));
        const ok = r.status === status && r.message.toLowerCase().includes(needle.toLowerCase());
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  Discord ${code} -> ${r.status} "${r.message}"`);
    }

    c = classify(badRequest('Invalid guild id', 'BAD_ID'));
    check('deliberate ApiError keeps its status and message',
        c.status === 400 && c.message === 'Invalid guild id' && c.code === 'BAD_ID');

    console.log('\nLive server behaviour:\n');

    const srv = require('../../backend/src/server.js');
    srv.app.get('/__login/:id', (r, s) => {
        r.session.user = { id: r.params.id };
        r.session.userGuilds = [{ id: GUILD }];
        r.session.save(() => s.json({ ok: true }));
    });
    // Routes that deliberately throw, to exercise the terminal handler.
    srv.app.get('/__boom', () => { throw new Error("ENOENT: open '/srv/secret.json'"); });
    srv.app.get('/__boom-async', async () => { throw new Error("internal detail leak"); });
    srv.app.get('/__boom-api', () => { throw new ApiError(418, 'Deliberate teapot', 'TEAPOT'); });
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    const cookie = (await req('/__login/admin')).headers['set-cookie']
        .map((x) => x.split(';')[0]).join('; ');

    let r = await req('/__boom');
    let body = {};
    try { body = JSON.parse(r.body); } catch { /* ignore */ }
    check('sync throw returns 500', r.status === 500, `${r.status}`);
    check('response carries no filesystem path', !/srv|secret\.json|ENOENT/.test(r.body), r.body.slice(0, 90));
    check('response includes a correlation id', typeof body.requestId === 'string' && body.requestId.length >= 8,
        String(body.requestId));

    r = await req('/__boom-async');
    check('async rejection is caught by the handler', r.status === 500, `${r.status}`);
    check('async response is also sanitised', !/internal detail leak/.test(r.body), r.body.slice(0, 90));

    r = await req('/__boom-api');
    body = {}; try { body = JSON.parse(r.body); } catch { /* ignore */ }
    check('ApiError status is honoured', r.status === 418, `${r.status}`);
    check('ApiError message reaches the client', body.error === 'Deliberate teapot', String(body.error));

    console.log('\nMigration must not have changed deliberate status codes:\n');

    r = await req(`/api/guild/${GUILD}/permissions`, {
        method: 'POST', cookie, body: { roleId: 'not-a-snowflake', level: 2 } });
    check('validation still returns 400', r.status === 400, `${r.status}`);

    r = await req('/api/guild/999999999999999999/confessions', { cookie });
    check('unknown guild still returns 404', r.status === 404, `${r.status}`);

    r = await req(`/api/guild/${GUILD}/confessions`);
    check('unauthenticated still returns 401', r.status === 401, `${r.status}`);

    r = await req(`/api/guild/${GUILD}/confessions`, { cookie });
    check('a normal request still succeeds', r.status === 200, `${r.status}`);

    console.log('\nSource-level guarantee:\n');
    const fs = require('fs');
    const path = require('path');
    const backend = path.join(__dirname, '..', '..', 'backend', 'src');
    const routeFiles = fs.readdirSync(path.join(backend, 'routes'))
        .filter((name) => name.endsWith('.js'))
        .map((name) => path.join(backend, 'routes', name));
    routeFiles.push(path.join(backend, 'server.js'));
    const leaking = routeFiles.filter((file) =>
        /res\.status\(500\)\.json\(\{ error: err\.message \}\)/.test(fs.readFileSync(file, 'utf8'))
    );
    check('no backend route returns a raw err.message', leaking.length === 0,
        leaking.map((file) => path.basename(file)).join(', '));

    console.log(fails === 0
        ? '\nAll error-handling checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
