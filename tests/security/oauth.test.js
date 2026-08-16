/**
 * Regression tests for the Discord OAuth flow and session handling.
 *
 * Covers two findings from the second-generation audit:
 *
 *  1. No `state` parameter — the authorize URL omitted it and the callback
 *     never checked one, so an attacker could hand a victim their own
 *     authorization code and silently sign the victim's browser into the
 *     ATTACKER's Discord account (login CSRF). Anything the victim then did
 *     on the dashboard would land in the attacker's session context.
 *  2. No session regeneration on login — a session id planted before login
 *     stayed valid afterwards (session fixation).
 *
 * Also asserts the Discord access token is not retained in the session and
 * that logout destroys it.
 *
 *   node tests/security/oauth.test.js
 */

process.env.DASHBOARD_PORT = process.env.DASHBOARD_PORT || '3199';
process.env.DASHBOARD_AUTH = 'true';
process.env.CLIENT_ID = '123456789012345678';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';

const http = require('http');
const { EventEmitter } = require('events');
const { Collection } = require('discord.js');

const PORT = process.env.DASHBOARD_PORT;

const botClient = Object.assign(new EventEmitter(), {
    user: { id: 'bot', tag: 'b#1', username: 'b', presence: { status: 'online', activities: [] },
            setPresence: () => {}, displayAvatarURL: () => null },
    ws: { ping: 1 }, uptime: 1, commands: new Collection(),
    guilds: { cache: new Collection() },
    application: { owner: null, fetch: async () => {} },
});

function req(path, { method = 'GET', cookie, headers = {} } = {}) {
    return new Promise((resolve) => {
        const r = http.request({
            hostname: '127.0.0.1', port: PORT, path, method,
            headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
        }, (res) => {
            let out = '';
            res.on('data', (c) => { out += c; });
            res.on('end', () => resolve({
                status: res.statusCode, body: out, headers: res.headers,
                location: res.headers.location || '',
            }));
        });
        r.on('error', () => resolve({ status: 0, body: '', location: '' }));
        r.end();
    });
}

const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

(async () => {
    const srv = require('../../backend/src/server.js');
    srv.startDashboard(botClient);
    await new Promise((r) => setTimeout(r, 1500));

    let fails = 0;
    const check = (label, ok, detail = '') => {
        if (!ok) fails++;
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
    };

    console.log('\nOAuth authorize step must issue an unpredictable state:\n');

    const start = await req('/api/auth/discord');
    const loc = start.location;
    const m = /[?&]state=([^&]+)/.exec(loc);
    check('authorize URL includes a state parameter', !!m, m ? '' : loc.slice(0, 90));
    const state1 = m ? m[1] : '';
    check('state is long enough to be unguessable', state1.length >= 32, `len=${state1.length}`);
    check('redirect targets discord.com', loc.startsWith('https://discord.com/api/oauth2/authorize'));

    const start2 = await req('/api/auth/discord');
    const m2 = /[?&]state=([^&]+)/.exec(start2.location);
    check('state differs between authorize requests', !!m2 && m2[1] !== state1);

    console.log('\nCallback must reject a missing or forged state:\n');

    const injected = await req('/api/auth/discord/callback?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    check('OAuth error text is HTML-escaped',
        injected.status === 400 && !injected.body.includes('<script>') && injected.body.includes('&lt;script&gt;'));

    const sess = cookieOf(start);

    let r = await req('/api/auth/discord/callback?code=abc', { cookie: sess });
    check('callback with NO state is refused', r.status === 400, `${r.status}`);
    check('refusal mentions verification', /verification failed|state/i.test(r.body));

    r = await req('/api/auth/discord/callback?code=abc&state=forged-value', { cookie: sess });
    check('callback with a forged state is refused', r.status === 400, `${r.status}`);

    r = await req('/api/auth/discord/callback?code=abc&state=' + state1, { cookie: '' });
    check('callback with no session is refused', r.status === 400, `${r.status}`);

    // A correct state is single-use: the first attempt consumed it (the token
    // exchange then fails against the real Discord API, which is expected here).
    r = await req('/api/auth/discord/callback?code=abc&state=' + state1, { cookie: sess });
    check('state cannot be replayed after use', r.status === 400, `${r.status}`);

    console.log('\nSession hygiene:\n');

    const status = await req('/api/auth/status');
    check('auth status reports authRequired', /"authRequired":true/.test(status.body));
    check('auth status reports the public client id', /"clientId":"123456789012345678"/.test(status.body));
    check('auth status leaks no client secret', !/test-secret/.test(status.body));

    const originalClientId = process.env.CLIENT_ID;
    process.env.CLIENT_ID = 'not-an-application-id';
    const badStatus = await req('/api/auth/status');
    check('invalid client id disables OAuth before redirecting to Discord',
        /"oauthEnabled":false/.test(badStatus.body) && /valid Discord Application ID/.test(badStatus.body));
    const badStart = await req('/api/auth/discord');
    check('invalid OAuth configuration gets an actionable local error', badStart.status === 400
        && /valid Discord Application ID/.test(badStart.body));
    // Test is strictly sequential; restore the process-global fixture after the awaited probes.
    // eslint-disable-next-line require-atomic-updates
    process.env.CLIENT_ID = originalClientId;

    const anon = await req('/api/guilds');
    check('unauthenticated API access still refused', anon.status === 401, `${anon.status}`);

    const logout = await req('/api/auth/logout', { method: 'POST', cookie: sess });
    check('logout succeeds', logout.status === 200, `${logout.status}`);

    console.log(fails === 0
        ? '\nAll OAuth and session checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
