const fs = require('fs');
const os = require('os');
const path = require('path');
const setup = require('../../backend/src/routes/setup');

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('\nLocal-only environment editor:\n');

check('allowlist rejects arbitrary environment keys', (() => {
    try { setup.validateUpdates({ PATH: '/attacker' }); return false; } catch { return true; }
})());
check('database placeholders are rejected before saving', (() => {
    try { setup.validateUpdates({ DATABASE_URL: 'postgresql://user:pass@base:5432/db' }); return false; } catch { return true; }
})());
check('Discord Application ID is validated', (() => {
    try { setup.validateUpdates({ CLIENT_ID: 'not-an-id' }); return false; } catch { return true; }
})());

const file = path.join(os.tmpdir(), `eb-env-editor-${process.pid}`);
fs.writeFileSync(file, '# existing\nLOG_LEVEL=debug\n', { mode: 0o600 });
const updated = setup.writeEnv({
    CLIENT_ID: '123456789012345678',
    SESSION_SECRET: 'test-only-session-secret-not-real',
    LOG_LEVEL: 'info',
}, file);
const text = fs.readFileSync(file, 'utf8');
check('writer updates and appends only approved keys',
    updated.length === 3 && /LOG_LEVEL="info"/.test(text) && /CLIENT_ID=/.test(text));
check('writer never makes the file group/world-readable',
    process.platform === 'win32' || (fs.statSync(file).mode & 0o077) === 0);

const status = setup.statusPayload();
check('status returns booleans, never secret values',
    typeof status.configured.DISCORD_TOKEN === 'boolean'
    && !JSON.stringify(status).includes('test-only-session-secret'));

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'src', 'routes', 'setup.js'), 'utf8');
check('editor is disabled in production', /NODE_ENV === 'production'/.test(source));
check('editor requires a direct loopback request', /!isLoopback\(req\)/.test(source));

try { fs.unlinkSync(file); } catch { /* cleanup */ }
console.log(fails === 0 ? '\nAll local setup checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
process.exit(fails === 0 ? 0 : 1);
