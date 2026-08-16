/**
 * Regression tests for guild isolation, CSRF, and privileged-export access.
 *
 * Covers the three vulnerabilities found in the second-generation audit:
 *
 *  1. dashboard/routes/permissions.js mounts at
 *     /api/guild/:guildId/permissions — BEFORE the guilds router — so it never
 *     inherited that router's auth/membership stack. It was reachable with no
 *     session at all, and readable across guilds.
 *  2. GET /backup sat at level 0, dumping confessions_* (with author ids) and
 *     every security setting to any Viewer, bypassing the redaction on
 *     GET /confessions.
 *  3. POST /restore matched keys with key.includes(guildId) — a substring test
 *     that let an Admin write into a different guild's keys.
 *
 * Plus CSRF: the dashboard is cookie-authenticated, so unsafe methods must
 * reject forged cross-origin requests.
 *
 *   node tests/security/isolation.test.js
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3188';
process.env.DASHBOARD_AUTH = 'true';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;
const GUILD_A = '111111111111111111';   // user is a member
const GUILD_B = '222222222222222222';   // user is NOT a member
const ROLE_A = '333333333333333333';

function mkMember(id, admin) {
    return {
        id,
        user: { id, username: id, bot: false, tag: `${id}#0`, displayAvatarURL: () => null },
        permissions: { has: () => admin },
        roles: { cache: new Collection(), highest: { position: admin ? 20 : 0 }, set: async () => {} },
        joinedTimestamp: Date.now(), displayName: id,
    };
}

const viewer = mkMember('viewer', false);   // level 0
const admin = mkMember('admin', true);      // level 3 (Administrator)
const membersA = new Collection([['viewer', viewer], ['admin', admin]]);

function mkGuild(id, members) {
    return {
        id, name: `G${id}`, memberCount: members.size, ownerId: 'nobody',
        iconURL: () => null, createdTimestamp: Date.now(),
        premiumTier: 0, premiumSubscriptionCount: 0,
        roles: { cache: new Collection([[ROLE_A, { id: ROLE_A, name: 'Role', position: 5, managed: false }]]) },
        channels: { cache: new Collection() }, emojis: { cache: new Collection() },
        stickers: { cache: new Collection() },
        bans: { fetch: async () => new Collection() },
        invites: { fetch: async () => new Collection() },
        members: {
            me: { roles: { highest: { position: 50 } }, permissions: { has: () => true } },
            cache: members,
            fetch: async (i) => (i === undefined || typeof i === 'object')
                ? members : (members.get(String(i)) || null),
        },
    };
}

const guildA = mkGuild(GUILD_A, membersA);
const guildB = mkGuild(GUILD_B, new Collection());

const botClient = Object.assign(new EventEmitter(), {
    user: { id: 'bot', tag: 'b#1', username: 'b', presence: { status: 'online', activities: [] },
            setPresence: () => {}, displayAvatarURL: () => null },
    ws: { ping: 1 }, uptime: 1, commands: new Collection(),
    guilds: { cache: new Collection([[GUILD_A, guildA], [GUILD_B, guildB]]) },
    application: { owner: null, fetch: async () => {} },
    player: { nodes: { get: () => null } },
});

function req(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    return new Promise((resolve) => {
        const data = body === undefined ? null
            : (typeof body === 'string' ? body : JSON.stringify(body));
        const r = http.request({
            hostname: '127.0.0.1', port: PORT, path, method,
            headers: {
                ...(data ? { 'Content-Type': 'application/json' } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...headers,
            },
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

async function loginAs(id) {
    const res = await req(`/__login/${id}`);
    return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
}

(async () => {
    const { db } = require('../../database/index');
    await db.set(`confessions_${GUILD_A}`, [{ id: 'c1', text: 'secret', authorId: 'U-PRIV', authorTag: 'p#1' }]);
    await db.set(`dashboard_perms_${GUILD_B}`, [{ roleId: ROLE_A, level: 3 }]);
    await db.set(`automod_${GUILD_B}`, { untouched: true });
    // Clear state a previous (possibly pre-fix) run may have left behind, so the
    // assertions below reflect this run only.
    await Promise.all([db.delete(`automod_${GUILD_A}`), db.delete(`automod_${GUILD_A}9`)]).catch(() => {});

    const srv = require('../../backend/src/server.js');
    srv.app.get('/__login/:id', (r, s) => {
        r.session.user = { id: r.params.id };
        r.session.userGuilds = [{ id: GUILD_A }];
        r.session.save(() => s.json({ ok: true }));
    });
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    const viewerCookie = await loginAs('viewer');
    const adminCookie = await loginAs('admin');

    let fails = 0;
    const check = (label, ok, detail = '') => {
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    };

    console.log('\nPermissions router must not bypass the guild gate:\n');

    let r = await req(`/api/guild/${GUILD_A}/permissions`);
    check('anonymous read of permissions is refused', r.status === 401, `${r.status}`);

    r = await req(`/api/guild/${GUILD_A}/permissions`, {
        method: 'POST', body: { roleId: ROLE_A, level: 3 } });
    check('anonymous grant of a dashboard level is refused', r.status === 401, `${r.status}`);

    r = await req(`/api/guild/${GUILD_B}/permissions`, { cookie: viewerCookie });
    check('cross-guild read of permissions is refused', r.status === 403, `${r.status}`);

    r = await req(`/api/guild/${GUILD_B}/permissions/my-level`, { cookie: viewerCookie });
    check('cross-guild my-level is refused', r.status === 403, `${r.status}`);

    r = await req(`/api/guild/${GUILD_A}/permissions/my-level`, { cookie: viewerCookie });
    check('own-guild my-level still works', r.status === 200, `${r.status}`);

    r = await req(`/api/guild/${GUILD_A}/permissions`, {
        method: 'POST', cookie: adminCookie, body: { roleId: 'not-a-snowflake', level: 2 } });
    check('malformed role id is rejected', r.status === 400, `${r.status}`);

    console.log('\nMusic router must enforce guild isolation:\n');

    r = await req(`/api/music/${GUILD_B}`, { cookie: viewerCookie });
    check('cross-guild queue read is refused', r.status === 403, `${r.status}`);

    r = await req(`/api/music/${GUILD_A}`, { cookie: viewerCookie });
    check('own-guild queue read still works', r.status === 200, `${r.status}`);

    console.log('\nBackup is an Admin-only export:\n');

    r = await req(`/api/guild/${GUILD_A}/backup`, { cookie: viewerCookie });
    check('Viewer cannot download a backup', r.status === 403, `${r.status}`);
    check('backup body contains no confession author', !/U-PRIV/.test(r.body));

    r = await req(`/api/guild/${GUILD_A}/backup`, { cookie: adminCookie });
    check('Admin can download a backup', r.status === 200, `${r.status}`);

    console.log('\nRestore must not write into another guild:\n');

    await req(`/api/guild/${GUILD_A}/restore`, {
        method: 'POST', cookie: adminCookie,
        body: {
            [`automod_${GUILD_A}`]: { mine: true },
            [`automod_${GUILD_B}`]: { hijacked: true },
            [`automod_${GUILD_A}9`]: { hijacked: true },
            __proto__: { polluted: true },
        },
    });
    const other = await db.get(`automod_${GUILD_B}`);
    check('other guild config untouched by restore', JSON.stringify(other) === JSON.stringify({ untouched: true }),
        JSON.stringify(other));
    // The real substring bug: `automod_<GUILD_A>9` CONTAINS GUILD_A, so the old
    // key.includes() test wrote it. endsWith(`_<gid>`) must reject it.
    const superstring = await db.get(`automod_${GUILD_A}9`);
    check('superstring guild key rejected by restore', superstring === null || superstring === undefined,
        JSON.stringify(superstring));
    check('no prototype pollution via restore', {}.polluted === undefined);
    const mine = await db.get(`automod_${GUILD_A}`);
    check('own guild config was restored', !!mine && mine.mine === true, JSON.stringify(mine));

    console.log('\nCSRF: unsafe methods reject forged cross-origin requests:\n');

    for (const [label, headers] of [
        ['Origin: https://evil.example', { Origin: 'https://evil.example' }],
        ['Referer: https://evil.example/x', { Referer: 'https://evil.example/x' }],
        ['Origin: null (sandboxed iframe)', { Origin: 'null' }],
    ]) {
        const res = await req(`/api/guild/${GUILD_A}/automod`, {
            method: 'POST', cookie: adminCookie, headers,
            body: { setting: 'badWords', value: false } });
        const ok = res.status === 403 && /CSRF_ORIGIN/.test(res.body);
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  POST blocked (${label})  ${res.status}`);
    }

    r = await req(`/api/guild/${GUILD_A}/automod`, {
        method: 'POST', cookie: adminCookie,
        headers: { Origin: `http://127.0.0.1:${PORT}` },
        body: { setting: 'badWords', value: true } });
    check('same-origin POST still works', r.status === 200, `${r.status}`);

    r = await req(`/api/guild/${GUILD_A}/confessions`, {
        cookie: adminCookie, headers: { Origin: 'https://evil.example' } });
    check('safe GET is not blocked by the CSRF guard', r.status === 200, `${r.status}`);

    await Promise.all([
        db.delete(`confessions_${GUILD_A}`), db.delete(`dashboard_perms_${GUILD_B}`),
        db.delete(`automod_${GUILD_A}`), db.delete(`automod_${GUILD_B}`), db.delete(`automod_${GUILD_A}9`),
    ]).catch(() => {});

    console.log(fails === 0
        ? '\nAll isolation, export and CSRF checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
