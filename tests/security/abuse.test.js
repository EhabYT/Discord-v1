/**
 * Regression tests for abuse resistance and bulk-operation safety.
 *
 * Findings from the third audit pass:
 *
 *  1. POST /verification/kick-pending looped over every pending entry issuing
 *     one Discord kick each — uncapped, and without the hierarchy check applied
 *     to single-member actions. An Admin could sweep out moderators, and a large
 *     pending list would burn the bot's global Discord rate-limit budget inside
 *     one request (degrading the bot for EVERY guild it serves).
 *  2. Expensive endpoints (mass moderation, full-config export/restore, anything
 *     that makes the bot post) had only the crude global 400 req/min/IP limit.
 *
 *   node tests/security/abuse.test.js
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3202';
process.env.DASHBOARD_AUTH = 'true';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;
const GUILD = '111111111111111111';

const kicked = [];

function mkMember(id, { admin = false, position = 0, kickable = true } = {}) {
    return {
        id,
        user: { id, username: id, bot: false, tag: `${id}#0`, displayAvatarURL: () => null },
        permissions: { has: () => admin },
        roles: { cache: new Collection(), highest: { position }, set: async () => {} },
        kickable,
        kick: async () => { kicked.push(id); return true; },
        joinedTimestamp: Date.now(), displayName: id,
    };
}

// The actor is an Admin (level 3). 'staff' outranks nobody but sits ABOVE the
// actor, so a bulk sweep must skip them. 'peonN' are ordinary members.
const actor = mkMember('admin', { admin: true, position: 20 });
const staff = mkMember('staff', { position: 30 });
const members = new Collection([['admin', actor], ['staff', staff]]);
const PENDING = { staff: { kickAt: 1 } };
for (let i = 0; i < 80; i++) {
    const id = `peon${i}`;
    members.set(id, mkMember(id, { position: 0 }));
    PENDING[id] = { kickAt: 1 };            // all overdue
}

const guild = {
    id: GUILD, name: 'G', memberCount: members.size, ownerId: 'nobody',
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
    const { db } = require('../../database/index');
    await db.set(`verification_${GUILD}`, { enabled: true, kickUnverifiedMinutes: 10 });
    await db.set(`verification_pending_${GUILD}`, PENDING);

    const srv = require('../../backend/src/server.js');
    srv.app.get('/__login/:id', (r, s) => {
        r.session.user = { id: r.params.id };
        r.session.userGuilds = [{ id: GUILD }];
        r.session.save(() => s.json({ ok: true }));
    });
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    const cookie = (await req('/__login/admin')).headers['set-cookie']
        .map((c) => c.split(';')[0]).join('; ');

    let fails = 0;
    const check = (label, ok, detail = '') => {
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    };

    console.log('\nBulk kick must be capped and hierarchy-aware:\n');

    const r1 = await req(`/api/guild/${GUILD}/verification/kick-pending`,
        { method: 'POST', cookie, body: { overdueOnly: true } });
    let payload = {};
    try { payload = JSON.parse(r1.body); } catch { /* ignore */ }

    check('request succeeds', r1.status === 200, `${r1.status}`);
    check('batch is capped (<= 50 kicks)', kicked.length <= 50, `kicked=${kicked.length}`);
    check('response reports the remainder', typeof payload.remaining === 'number' && payload.remaining > 0,
        `remaining=${payload.remaining}`);
    check('member above the actor was NOT kicked', !kicked.includes('staff'),
        kicked.includes('staff') ? 'staff was kicked!' : '');
    check('skipped count reported', typeof payload.skipped === 'number', `skipped=${payload.skipped}`);

    console.log('\nExpensive endpoints are rate limited per user:\n');

    // bulkModeration allows 3 per 5 min; one was just consumed.
    const codes = [];
    for (let i = 0; i < 4; i++) {
        const r = await req(`/api/guild/${GUILD}/verification/kick-pending`,
            { method: 'POST', cookie, body: { overdueOnly: true } });
        codes.push(r.status);
    }
    check('repeated bulk moderation is throttled', codes.includes(429), codes.join(','));

    const last = await req(`/api/guild/${GUILD}/verification/kick-pending`,
        { method: 'POST', cookie, body: { overdueOnly: true } });
    check('429 includes a Retry-After header', !!last.headers['retry-after'],
        String(last.headers['retry-after']));
    check('429 body carries a machine-readable code', /RATE_LIMITED/.test(last.body));

    const exportCodes = [];
    for (let i = 0; i < 12; i++) {
        exportCodes.push((await req(`/api/guild/${GUILD}/backup`, { cookie })).status);
    }
    check('config export is throttled', exportCodes.includes(429),
        `${exportCodes.filter((c) => c === 200).length}x200 ${exportCodes.filter((c) => c === 429).length}x429`);

    const cheap = await req(`/api/guild/${GUILD}/confessions`, { cookie });
    check('cheap reads are unaffected by those limits', cheap.status === 200, `${cheap.status}`);

    await Promise.all([
        db.delete(`verification_${GUILD}`), db.delete(`verification_pending_${GUILD}`),
    ]).catch(() => {});

    console.log(fails === 0
        ? '\nAll abuse-resistance checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
