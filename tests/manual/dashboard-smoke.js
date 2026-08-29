const http = require('http');

const BASE = process.env.DASHBOARD_URL || 'http://127.0.0.1:3000';
const GID = process.env.GUILD_ID || '1062084713860309072';
const ALLOW_DEGRADED = process.env.ALLOW_DEGRADED === 'true';
const protectedOk = (response, predicate) => predicate(response)
    || (ALLOW_DEGRADED && response.status === 401);

function req(path, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const data = body ? JSON.stringify(body) : null;
        const req_ = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            method,
            headers: {
                'Accept': 'application/json',
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(raw); } catch { /* html or empty */ }
                resolve({ status: res.statusCode, json, raw, headers: res.headers });
            });
        });
        req_.on('error', reject);
        req_.setTimeout(8000, () => { req_.destroy(new Error('timeout ' + path)); });
        if (data) req_.write(data);
        req_.end();
    });
}

(async () => {
    const fails = [];
    const ok = [];
    async function expect(label, path, pred, opts) {
        try {
            const res = await req(path, opts);
            const pass = pred(res);
            if (pass) ok.push(label);
            else fails.push([label, `status=${res.status} body=${(res.raw || '').slice(0, 160)}`]);
        } catch (e) {
            fails.push([label, e.message]);
        }
    }

    await expect('health', '/api/health', r => r.status === 200 && r.json?.ok === true
        && (r.json.botOnline === true || (ALLOW_DEGRADED && r.json.botOnline === false)));
    await expect('stats', '/api/stats', r => protectedOk(r, x => x.status === 200 && x.json?.commands >= 90 && x.json.guilds >= 1));
    await expect('guilds', '/api/guilds', r => protectedOk(r, x => x.status === 200 && Array.isArray(x.json) && x.json.length >= 1));
    await expect('me', '/api/me', r => protectedOk(r, x => x.status === 200 && x.json?.username));
    await expect('auth-status', '/api/auth/status', r => r.status === 200 && typeof r.json?.loggedIn === 'boolean');
    await expect('presence', '/api/bot/presence', r => protectedOk(r, x => x.status === 200 && x.json?.tag));
    await expect('analytics-global', '/api/analytics/global', r => protectedOk(r, x => x.status === 200 && typeof x.json?.totalCommands === 'number'));
    await expect('performance', '/api/performance', r => protectedOk(r, x => x.status === 200 && typeof x.json?.ping === 'number'));
    await expect('spa', '/', r => r.status === 200 && /EB Dashboard|EB-BOT/.test(r.raw));
    const spa = await req('/');
    const js = (spa.raw.match(/src="(\/assets\/[^"]+\.js)"/) || [])[1];
    const css = (spa.raw.match(/href="(\/assets\/[^"]+\.css)"/) || [])[1];
    if (js) await expect('assets-js', js, r => r.status === 200 && r.raw.length > 1000);
    else fails.push(['assets-js', 'no script tag']);
    if (css) await expect('assets-css', css, r => r.status === 200 && r.raw.length > 100);
    else fails.push(['assets-css', 'no stylesheet']);
    await expect('auth-redirect-uri', '/api/auth/status', r => r.status === 200 && typeof r.json?.redirectUri === 'string');

    const guildGets = [
        '', '/leaderboard', '/warnings', '/activity', '/verification',
        '/verification/overview', '/verification/pending', '/verification/log', '/reactionroles', '/birthdays',
        '/suggestions', '/polls', '/tags', '/confessions', '/board', '/tickets',
        '/giveaways', '/members', '/rewards', '/security', '/backup',
        '/xp/details', '/xp/announce', '/xp/rolemultipliers', '/growth',
        '/analytics/chart', '/analytics/commands', '/analytics/summary',
        '/commands', '/security'
    ];
    for (const p of guildGets) {
        await expect('guild' + (p || '/'), `/api/guild/${GID}${p}`, r => protectedOk(r, x => x.status === 200));
    }
    await expect('guild-404', '/api/guild/0', r => r.status === 404 || (ALLOW_DEGRADED && r.status === 401));
    await expect('music', `/api/music/${GID}`, r => protectedOk(r, x => x.status === 200 && x.json && 'playing' in x.json));
    await expect('perms', `/api/guild/${GID}/permissions`, r => protectedOk(r, x => x.status === 200 && Array.isArray(x.json?.levelAccess)));

    console.log(JSON.stringify({ ok: ok.length, fails, paths: ok }, null, 2));
    process.exit(fails.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
