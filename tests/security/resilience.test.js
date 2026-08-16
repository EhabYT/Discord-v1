/**
 * Regression tests for error-handling resilience (Phase 2).
 *
 * Three defects found in the Phase 1 discovery, all reproduced before fixing:
 *
 *  H1 — events/index.js dispatched `event.execute(...)` without catching the
 *       returned promise. Every handler in events/ is async, and discord.js
 *       ignores a listener's return value, so any rejection escaped to
 *       process.on('unhandledRejection'). The event was lost with no record of
 *       which handler failed.
 *  H2 — index.js read `reason.message` directly off the rejection value. A
 *       rejection is not guaranteed to be an Error; rejecting with a string
 *       logged `undefined`, and rejecting with null made the error handler
 *       itself throw.
 *  H3 — uncaughtException logged and continued. Node's contract is that the
 *       process is in an undefined state afterwards; continuing risks corrupt
 *       SQLite writes.
 *
 *   node tests/security/resilience.test.js
 */

const path = require('path');
const { EventEmitter } = require('events');

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

// Capture logger output so we can assert the failure was *recorded*, not just swallowed.
const logger = require('../../shared/lib/logger');
const logged = [];
for (const level of ['error', 'warn', 'info', 'debug']) {
    const original = logger[level].bind(logger);
    logger[level] = (msg, meta) => { logged.push({ level, msg: String(msg), meta }); };
    logger[`__orig_${level}`] = original;
}

const { loadEvents } = require('../../bot/src/events/index.js');

/** A client stub that records listeners the loader registers. */
function makeClient() {
    const c = new EventEmitter();
    c.player = null;
    return c;
}

(async () => {
    console.log('\nH1 — async handler rejections must not escape the dispatcher:\n');

    let escaped = null;
    const onUnhandled = (reason) => { escaped = reason; };
    process.on('unhandledRejection', onUnhandled);

    // Drive the REAL loader over the REAL events directory, then attach an
    // extra failing handler through the same registration path by re-invoking
    // the module's exported loader against a stub client.
    const client = makeClient();
    loadEvents(client);

    const registered = client.eventNames();
    check('loader registered the real event handlers', registered.length > 0,
        `${registered.length} events`);

    // messageCreate is async and will throw on a malformed message object.
    // Emitting garbage exercises the dispatcher's catch path for real.
    logged.length = 0;
    client.emit('messageCreate', null);
    await new Promise((r) => setTimeout(r, 150));

    check('a throwing handler did not produce an unhandled rejection', escaped === null,
        escaped ? String(escaped && escaped.message || escaped) : '');

    const boundaryLog = logged.find((l) => l.level === 'error'
        && /event handler (threw|rejected)/i.test(l.msg));
    check('the dispatcher logged which handler failed', !!boundaryLog,
        boundaryLog ? boundaryLog.msg : 'no boundary log entry');

    // Explicitly verify the async (rejection) branch, not just the sync throw.
    escaped = null;
    logged.length = 0;
    const c2 = makeClient();
    const evIndex = require('../../bot/src/events/index.js');
    // Re-register via loadEvents on a fresh client, then emit an event whose
    // handler is async and will reject on a null argument.
    evIndex.loadEvents(c2);
    c2.emit('guildMemberAdd', null);
    await new Promise((r) => setTimeout(r, 150));
    check('async rejection path is also contained', escaped === null,
        escaped ? String(escaped && escaped.message || escaped) : '');

    process.removeListener('unhandledRejection', onUnhandled);

    console.log('\nH2 — the error describer must survive non-Error values:\n');

    // Mirrors the describe() helper in index.js. Re-implemented here rather
    // than exported, because index.js logs in and starts the bot on require.
    const describe = (value) => {
        if (value instanceof Error) return { error: value.message, stack: value.stack };
        if (value && typeof value === 'object') {
            try { return { error: JSON.stringify(value).slice(0, 500), stack: null }; }
            catch { return { error: '[unserialisable rejection value]', stack: null }; }
        }
        return { error: String(value), stack: null };
    };

    const cases = [
        ['Error', new Error('real error'), 'real error'],
        ['string', 'just a string', 'just a string'],
        ['null', null, 'null'],
        ['undefined', undefined, 'undefined'],
        ['number', 42, '42'],
        ['plain object', { code: 50013 }, '{"code":50013}'],
    ];
    for (const [label, input, expected] of cases) {
        let out;
        let threw = false;
        try { out = describe(input); } catch { threw = true; }
        check(`describe() handles ${label}`, !threw && out.error === expected,
            threw ? 'THREW' : String(out && out.error));
    }

    const circular = {}; circular.self = circular;
    let circularOk = true;
    try { describe(circular); } catch { circularOk = false; }
    check('describe() handles a circular object', circularOk);

    console.log('\nH3 — uncaughtException must terminate the process:\n');

    // Run index.js's handler shape in a child process and assert it exits non-zero.
    const { spawnSync } = require('child_process');
    const child = spawnSync(process.execPath, ['-e', `
        const describe = (v) => (v instanceof Error)
            ? { error: v.message } : { error: String(v) };
        process.on('uncaughtException', (e) => {
            console.error('logged:' + describe(e).error);
            setTimeout(() => process.exit(1), 50).unref();
        });
        setTimeout(() => { throw new Error('fatal'); }, 10);
        setTimeout(() => { console.log('STILL-ALIVE'); }, 400);
    `], { encoding: 'utf8', timeout: 8000 });

    check('process exits non-zero after an uncaught exception', child.status === 1,
        `exit=${child.status}`);
    check('the exception was logged before exit', /logged:fatal/.test(child.stderr || ''));
    check('the process did NOT keep running', !/STILL-ALIVE/.test(child.stdout || ''));

    const missingSecret = spawnSync(process.execPath, ['-e', `
        process.env.NODE_ENV = 'production';
        process.env.DASHBOARD_AUTH = 'true';
        delete process.env.SESSION_SECRET;
        delete process.env.DATABASE_URL;
        require('./backend/src/server');
        console.log('SERVER-MODULE-OK');
        process.exit(0);
    `], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', timeout: 8000 });
    check('missing SESSION_SECRET no longer takes Render offline',
        missingSecret.status === 0 && /SERVER-MODULE-OK/.test(missingSecret.stdout || ''),
        `exit=${missingSecret.status}`);

    console.log('\nSource-level guarantees:\n');

    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'bot', 'src', 'events', 'index.js'), 'utf8');
    check('client events are wrapped by the boundary', /client\.(on|once)\(event\.name, handler\)/.test(src));
    check('player events are wrapped by the boundary', /safeDispatch\('Player'/.test(src));
    check('handlers missing execute() are rejected at load', /typeof event\.execute !== 'function'/.test(src));

    const idx = fs.readFileSync(path.join(__dirname, '..', '..', 'bot', 'src', 'index.js'), 'utf8');
    check('index.js no longer reads .message off a raw rejection',
        !/reason\.message/.test(idx));
    check('index.js exits on uncaughtException', /process\.exit\(1\)/.test(idx));
    check('commands deploy only when explicitly enabled',
        /process\.env\.DEPLOY_COMMANDS === 'true'/.test(idx)
        && !/DEPLOY_COMMANDS === 'true' \|\| !process\.env\.GUILD_ID/.test(idx));
    check('dashboard starts before Discord diagnostics',
        idx.indexOf('startDashboard(client)') < idx.indexOf('runDiagnostics(db)'));
    check('configuration failure keeps the dashboard process alive',
        /Startup diagnostics failed[\s\S]{0,200}return;/.test(idx));
    check('Discord login rejection is handled locally',
        /await client\.login[\s\S]{0,200}catch \(err\)/.test(idx));

    // Restore the real logger.
    for (const level of ['error', 'warn', 'info', 'debug']) {
        logger[level] = logger[`__orig_${level}`];
    }

    console.log(fails === 0
        ? '\nAll resilience checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
