const { PostgresDatabase, databaseConfigIssue } = require('../../database/index');

class FakePool {
    constructor() { this.data = new Map(); }
    async query(sql, params = []) {
        if (/CREATE TABLE/.test(sql)) return { rows: [], rowCount: 0 };
        if (/INSERT INTO bot_kv/.test(sql)) {
            this.data.set(params[0], JSON.parse(params[1]));
            return { rows: [], rowCount: 1 };
        }
        if (/SELECT value FROM bot_kv/.test(sql)) {
            return { rows: this.data.has(params[0]) ? [{ value: this.data.get(params[0]) }] : [] };
        }
        if (/DELETE FROM bot_kv/.test(sql)) {
            return { rows: [], rowCount: this.data.delete(params[0]) ? 1 : 0 };
        }
        if (/SELECT key AS id/.test(sql)) {
            return { rows: [...this.data].sort().map(([id, value]) => ({ id, value })) };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    }
}

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

(async () => {
    console.log('\nSupabase PostgreSQL key/value adapter:\n');
    check('rejects a project ref instead of a connection URI',
        /complete postgresql/.test(databaseConfigIssue('yhyltmxdbbiybpgsaqki')));
    check('rejects placeholder hostnames before DNS lookup',
        /placeholder hostname/.test(databaseConfigIssue('postgresql://user:pass@base:5432/postgres')));
    check('accepts a complete Session Pooler-shaped URI',
        databaseConfigIssue('postgresql://postgres.project:pass@aws-0-region.pooler.supabase.com:5432/postgres') === null);
    const db = new PostgresDatabase(new FakePool());
    check('schema initialization succeeds', await db.ready());
    await db.set('config_1', { enabled: true, count: 3 });
    check('JSON values round-trip', (await db.get('config_1'))?.count === 3);
    await db.set('number', 42);
    check('primitive values round-trip', await db.get('number') === 42);
    const all = await db.all();
    check('all() preserves QuickDB-compatible id/value shape',
        all.some((row) => row.id === 'config_1' && row.value.enabled === true));
    check('delete reports an existing key', await db.delete('config_1') === true);
    check('missing keys return null', await db.get('config_1') === null);

    console.log(fails === 0 ? '\nAll PostgreSQL adapter checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
