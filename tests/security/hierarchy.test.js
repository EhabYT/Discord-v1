/**
 * Regression test for dashboard authorisation beyond authentication:
 * Discord role hierarchy, plus privacy redaction of anonymous content.
 *
 * The slash commands (commands/ban.js, commands/role.js) refuse to action a
 * user whose highest role sits at or above the caller's. The dashboard routes
 * did not, so a Moderator could ban an Admin and an Admin could grant a role
 * above their own position — privilege escalation via the web UI.
 *
 *   node tests/security/hierarchy.test.js
 *
 * Exits non-zero if any escalation succeeds.
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3122';
process.env.DASHBOARD_AUTH = 'true';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;
const banned = [];
const rolesSet = [];

function role(id, name, position, managed = false) {
    return { id, name, position, managed };
}

const roles = new Collection();
[
    role('r_ever', '@everyone', 0),
    role('r_mod', 'Moderator', 10),
    role('r_admin', 'Admin', 20),
    role('r_bot', 'BotRole', 30),
    role('r_owner', 'Owner', 40),
    role('r_managed', 'BoosterBadge', 5, true),
].forEach((r) => roles.set(r.id, r));

function member(id, roleIds, admin = true) {
    const cache = new Collection();
    let highest = roles.get('r_ever');
    for (const rid of roleIds) {
        const r = roles.get(rid);
        cache.set(rid, r);
        if (r.position > highest.position) highest = r;
    }
    return {
        id,
        user: { id, username: `u${id}`, bot: false, tag: `u${id}#0`, displayAvatarURL: () => null },
        permissions: { has: () => admin },
        roles: {
            cache, highest,
            set: async (list) => { rolesSet.push({ target: id, list }); },
        },
        kick: async () => { banned.push(`kick:${id}`); },
        ban: async () => { banned.push(`ban:${id}`); },
        timeout: async () => { banned.push(`timeout:${id}`); },
        joinedTimestamp: Date.now(),
        displayName: `u${id}`,
    };
}

const MOD = member('mod', ['r_mod']);          // level-2 dashboard user
const ADMIN = member('admin', ['r_admin']);    // level-3 dashboard user
const OWNER = member('owner', ['r_owner']);
const BOT = member('bot', ['r_bot']);
const PEON = member('peon', [], false);   // no Administrator => level 0 Viewer

const members = new Collection([
    ['mod', MOD], ['admin', ADMIN], ['owner', OWNER], ['bot', BOT], ['peon', PEON],
]);

const guild = {
    id: '999999999999999999', name: 'HierarchyGuild', memberCount: 5, ownerId: 'owner',
    iconURL: () => null, createdTimestamp: Date.now(),
    premiumTier: 0, premiumSubscriptionCount: 0,
    roles: { cache: roles },
    channels: { cache: new Collection() },
    emojis: { cache: new Collection() },
    stickers: { cache: new Collection() },
    bans: { fetch: async () => new Collection() },
    invites: { fetch: async () => new Collection() },
    members: {
        me: BOT,
        cache: members,
        fetch: async (id) => (id === undefined || typeof id === 'object')
            ? members
            : (members.get(String(id)) || null),
    },
};

const botClient = Object.assign(new EventEmitter(), {
    user: { id: 'bot', tag: 'Bot#0001', username: 'Bot', presence: { status: 'online', activities: [] },
            setPresence: () => {}, displayAvatarURL: () => null },
    ws: { ping: 1 }, uptime: 1000, commands: new Collection(),
    guilds: { cache: new Collection([['999999999999999999', guild]]) },
    application: { owner: null, fetch: async () => {} },
});

function req(path, { method = 'GET', body, cookie } = {}) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const r = http.request(
            { hostname: '127.0.0.1', port: PORT, path, method,
              headers: { ...(data ? { 'Content-Type': 'application/json' } : {}),
                         ...(cookie ? { Cookie: cookie } : {}) } },
            (res) => {
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
    // Seed anonymous content and a Moderator-level role mapping.
    const { db } = require('../../database/index');
    await db.set('confessions_999999999999999999', [{ id: 'c1', text: 'secret', authorId: 'U-123', authorTag: 'u#1' }]);
    await db.set('suggestions_999999999999999999', [{ id: 's1', text: 'idea', anonymous: true, authorId: 'U-9', authorTag: 'a#9', status: 'pending' }]);
    await db.set('dashboard_perms_999999999999999999', [{ roleId: 'r_mod', level: 2 }]);

    const srv = require('../../backend/src/server.js');
    srv.app.get('/__login/:id', (r, s) => {
        r.session.user = { id: r.params.id, username: r.params.id };
        r.session.userGuilds = [{ id: '999999999999999999' }];
        r.session.save(() => s.json({ ok: true }));
    });
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    const modCookie = await loginAs('mod');
    const adminCookie = await loginAs('admin');

    let fails = 0;
    const check = (label, ok, detail = '') => {
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    };

    console.log('\nModeration actions must respect role hierarchy:\n');

    let r = await req('/api/guild/999999999999999999/members/admin/action',
        { method: 'POST', body: { action: 'ban' }, cookie: modCookie });
    check('Moderator banning an Admin is refused', r.status === 403, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/owner/action',
        { method: 'POST', body: { action: 'ban' }, cookie: adminCookie });
    check('Admin banning the server owner is refused', r.status === 403, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/mod/action',
        { method: 'POST', body: { action: 'ban' }, cookie: modCookie });
    check('Self-ban is refused', r.status === 403, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/peon/action',
        { method: 'POST', body: { action: 'kick' }, cookie: modCookie });
    check('Moderator kicking a regular member still works', r.status === 200, `${r.status}`);

    console.log('\nRole assignment must respect hierarchy:\n');

    r = await req('/api/guild/999999999999999999/members/peon/roles',
        { method: 'POST', body: { roles: ['r_owner'] }, cookie: adminCookie });
    check('Admin granting a role above their own is refused', r.status === 403, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/peon/roles',
        { method: 'POST', body: { roles: ['r_managed'] }, cookie: adminCookie });
    check('Granting an integration-managed role is refused', r.status === 403, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/peon/roles',
        { method: 'POST', body: { roles: ['r_bot'] }, cookie: adminCookie });
    check("Granting a role above the bot's own is refused", r.status === 403, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/peon/roles',
        { method: 'POST', body: { roles: ['nonexistent'] }, cookie: adminCookie });
    check('Unknown role id is rejected', r.status === 400, `${r.status}`);

    r = await req('/api/guild/999999999999999999/members/peon/roles',
        { method: 'POST', body: { roles: ['r_mod'] }, cookie: adminCookie });
    check('Admin granting a role below their own still works', r.status === 200, `${r.status}`);

    console.log('\nAnonymous content must stay anonymous below Moderator:\n');

    // 'peon' holds no roles => level 0 Viewer. 'mod' holds r_mod => level 2.
    const peonCookie = await loginAs('peon');

    let body = JSON.parse((await req('/api/guild/999999999999999999/confessions', { cookie: peonCookie })).body || '{}');
    let it = (body.items || [])[0] || {};
    check('Viewer cannot see confession authorId', !('authorId' in it) && !('authorTag' in it),
        JSON.stringify(it));
    check('Viewer still sees the confession text', it.text === 'secret');

    body = JSON.parse((await req('/api/guild/999999999999999999/confessions', { cookie: modCookie })).body || '{}');
    it = (body.items || [])[0] || {};
    check('Moderator may see confession authorId', it.authorId === 'U-123');

    body = JSON.parse((await req('/api/guild/999999999999999999/suggestions', { cookie: peonCookie })).body || '{}');
    it = (body.items || [])[0] || {};
    check('Viewer cannot see anonymous suggestion author', !('authorId' in it) && !('authorTag' in it),
        JSON.stringify(it));

    body = JSON.parse((await req('/api/guild/999999999999999999/suggestions', { cookie: modCookie })).body || '{}');
    it = (body.items || [])[0] || {};
    check('Moderator may see anonymous suggestion author', it.authorId === 'U-9');

    console.log('\nSide effects:\n');
    const bad = banned.filter((b) => /admin|owner/.test(b));
    check('no privileged member was actioned', bad.length === 0, bad.join(',') || '');
    const badRoles = rolesSet.filter((x) => x.list.some((i) => ['r_owner', 'r_bot', 'r_managed'].includes(i)));
    check('no over-privileged role was granted', badRoles.length === 0, JSON.stringify(badRoles) || '');

    await Promise.all([
        db.delete('confessions_999999999999999999'), db.delete('suggestions_999999999999999999'), db.delete('dashboard_perms_999999999999999999'),
    ]).catch(() => {});

    console.log(fails === 0
        ? '\nAll authorisation and privacy checks passed.\n'
        : `\n${fails} CHECK(S) FAILED — privilege escalation is possible.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
