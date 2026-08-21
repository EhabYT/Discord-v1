process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3277';
process.env.DASHBOARD_AUTH = 'true';
process.env.OWNER_ID = '111111111111111111';
process.env.DEVELOPER_IDS = '222222222222222222';
process.env.SUPPORT_IDS = '333333333333333333';
process.env.DEV_TOKEN = 'd'.repeat(64);

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');
const PORT = process.env.DASHBOARD_PORT;

const botClient = Object.assign(new EventEmitter(), {
    user: { id: 'bot', tag: 'bot#1', username: 'bot', presence: { status: 'online', activities: [] },
        setPresence: () => {}, displayAvatarURL: () => null },
    ws: { ping: 3 }, uptime: 1000, readyTimestamp: Date.now(), commands: new Collection(),
    guilds: { cache: new Collection() },
    application: { owner: null, fetch: async () => {} },
    isReady: () => true,
});

function req(path, { method = 'GET', body, cookie } = {}) {
    return new Promise((resolve) => {
        const data = body === undefined ? null : JSON.stringify(body);
        const r = http.request({ hostname: '127.0.0.1', port: PORT, path, method, headers: {
            ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
        } }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
        });
        r.on('error', () => resolve({ status: 0, body: '', headers: {} }));
        if (data) r.write(data);
        r.end();
    });
}
const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
async function login(id) { return cookieOf(await req(`/__dev_login/${id}`)); }

(async () => {
    const srv = require('../../backend/src/server');
    srv.app.get('/__dev_login/:id', (r, s) => {
        r.session.user = { id: r.params.id };
        r.session.userGuilds = [];
        r.session.save(() => s.json({ ok: true }));
    });
    srv.startDashboard(botClient);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let fails = 0;
    const check = (label, ok, detail = '') => {
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
    };
    console.log('\nDeveloper API route enforcement:\n');

    const ordinary = await login('444444444444444444');
    for (const endpoint of ['overview', 'commands', 'guilds', 'flags', 'logs', 'env', 'db', 'audit']) {
        const r = await req(`/api/developer/${endpoint}`, { cookie: ordinary });
        check(`ordinary user denied /${endpoint}`, r.status === 403, `${r.status}`);
    }

    const support = await login('333333333333333333');
    check('support may read overview', (await req('/api/developer/overview', { cookie: support })).status === 200);
    check('support cannot read environment', (await req('/api/developer/env', { cookie: support })).status === 403);
    check('support cannot write feature flags', (await req('/api/developer/flags', {
        method: 'POST', cookie: support, body: { maintenance: true },
    })).status === 403);

    const developer = await login('222222222222222222');
    const locked = await req('/api/developer/db', { cookie: developer });
    check('listed developer is locked before second factor', locked.status === 403);
    const unlock = await req('/api/developer/unlock', {
        method: 'POST', cookie: developer, body: { token: process.env.DEV_TOKEN },
    });
    const devCookie = [developer, cookieOf(unlock)].filter(Boolean).join('; ');
    check('listed developer can unlock with second factor', unlock.status === 200, `${unlock.status}`);
    check('unlocked developer may inspect database',
        (await req('/api/developer/db', { cookie: devCookie })).status === 200);
    check('developer still cannot deploy commands',
        (await req('/api/developer/deploy-commands', { method: 'POST', cookie: devCookie, body: {} })).status === 403);

    const owner = await login('111111111111111111');
    const who = await req('/api/developer/whoami', { cookie: owner });
    check('owner is automatically SUPER_ADMIN', who.status === 200 && /SUPER_ADMIN/.test(who.body));
    check('legacy developer prefix preserves method via 308 redirect',
        (await req('/api/dev/whoami', { cookie: owner })).status === 308);

    console.log(fails === 0 ? '\nAll developer-route checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
