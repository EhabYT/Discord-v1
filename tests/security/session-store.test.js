const fs = require('fs');
const os = require('os');
const path = require('path');
const { SQLiteSessionStore } = require('../../backend/src/session-store');

const file = path.join(os.tmpdir(), `eb-session-store-test-${process.pid}.sqlite`);
for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(file + suffix); } catch { /* absent */ }
}

const call = (store, method, ...args) => new Promise((resolve, reject) => {
    store[method](...args, (err, value) => err ? reject(err) : resolve(value));
});

let fails = 0;
function check(label, ok, detail = '') {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

(async () => {
    console.log('\nPersistent OAuth session store:\n');
    let store = new SQLiteSessionStore(file);
    const session = {
        user: { id: '123' },
        oauthState: 'state-value',
        cookie: { maxAge: 60_000 },
    };
    await call(store, 'set', 'sid-1', session);
    let loaded = await call(store, 'get', 'sid-1');
    check('session can be written and read', loaded?.oauthState === 'state-value');
    store.close();

    store = new SQLiteSessionStore(file);
    loaded = await call(store, 'get', 'sid-1');
    check('session survives a store restart', loaded?.user?.id === '123');

    await call(store, 'set', 'expired', { cookie: { expires: new Date(Date.now() - 1000) } });
    const expired = await call(store, 'get', 'expired');
    check('expired sessions are rejected and removed', expired === null);

    await call(store, 'destroy', 'sid-1');
    const destroyed = await call(store, 'get', 'sid-1');
    check('logout destroys the persisted session', destroyed === null);
    store.close();

    for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(file + suffix); } catch { /* absent */ }
    }

    console.log(fails === 0
        ? '\nAll session store checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
