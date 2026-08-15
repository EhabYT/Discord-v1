const {
    PostgresSessionStore, BoundedMemorySessionStore,
} = require('../../backend/src/session-store');

class FakePool {
    constructor() { this.rows = new Map(); }
    async query(sql, params = []) {
        if (/CREATE TABLE|CREATE INDEX/.test(sql)) return { rows: [], rowCount: 0 };
        if (/INSERT INTO dashboard_sessions/.test(sql)) {
            this.rows.set(params[0], { sess: JSON.parse(params[1]), expires: new Date(params[2]).getTime() });
            return { rows: [], rowCount: 1 };
        }
        if (/SELECT sess/.test(sql)) {
            const row = this.rows.get(params[0]);
            return { rows: row && row.expires > Date.now() ? [{ sess: row.sess }] : [], rowCount: row ? 1 : 0 };
        }
        if (/DELETE FROM dashboard_sessions WHERE sid/.test(sql)) {
            return { rows: [], rowCount: this.rows.delete(params[0]) ? 1 : 0 };
        }
        if (/DELETE FROM dashboard_sessions WHERE expires/.test(sql)) {
            for (const [sid, row] of this.rows) if (row.expires <= Date.now()) this.rows.delete(sid);
            return { rows: [], rowCount: 0 };
        }
        if (/UPDATE dashboard_sessions/.test(sql)) {
            const row = this.rows.get(params[1]);
            if (row) row.expires = new Date(params[0]).getTime();
            return { rows: [], rowCount: row ? 1 : 0 };
        }
        throw new Error(`Unexpected SQL in fake pool: ${sql}`);
    }
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
    console.log('\nSupabase PostgreSQL OAuth session store:\n');
    const pool = new FakePool();
    let store = new PostgresSessionStore(pool);
    const session = { user: { id: '123' }, oauthState: 'state-value', cookie: { maxAge: 60_000 } };
    await call(store, 'set', 'sid-1', session);
    let loaded = await call(store, 'get', 'sid-1');
    check('session can be written and read', loaded?.oauthState === 'state-value');
    clearInterval(store.pruneTimer);

    store = new PostgresSessionStore(pool);
    loaded = await call(store, 'get', 'sid-1');
    check('session survives a store restart', loaded?.user?.id === '123');
    await call(store, 'destroy', 'sid-1');
    check('logout destroys the persisted session', await call(store, 'get', 'sid-1') === null);
    clearInterval(store.pruneTimer);

    const fallback = new BoundedMemorySessionStore(2);
    await call(fallback, 'set', 'a', { cookie: { maxAge: 1000 } });
    await call(fallback, 'set', 'b', { cookie: { maxAge: 1000 } });
    await call(fallback, 'set', 'c', { cookie: { maxAge: 1000 } });
    check('emergency store is bounded', fallback.sessions.size === 2);

    console.log(fails === 0
        ? '\nAll session store checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
