const { PostgresDatabase, normalizeDatabaseUrl, databaseConfigIssue } = require('../../database/index');

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
        if (/DELETE FROM bot_kv WHERE key LIKE/.test(sql)) {
            const prefix = params[0].slice(0, -1).replace(/\\([\\%_])/g, '$1');
            let count = 0;
            for (const key of [...this.data.keys()]) {
                if (key.startsWith(prefix)) { this.data.delete(key); count++; }
            }
            return { rows: [], rowCount: count };
        }
        if (/DELETE FROM bot_kv/.test(sql)) {
            return { rows: [], rowCount: this.data.delete(params[0]) ? 1 : 0 };
        }
        if (/SELECT key AS id[\s\S]*WHERE key LIKE/.test(sql)) {
            const prefix = params[0].slice(0, -1).replace(/\\([\\%_])/g, '$1');
            const rows = [...this.data].filter(([id]) => id.startsWith(prefix) && (!params[1] || id > params[1]))
                .sort(([a], [b]) => a.localeCompare(b)).slice(0, params[2]).map(([id, value]) => ({ id, value }));
            return { rows };
        }
        if (/SELECT key AS id/.test(sql)) {
            return { rows: [...this.data].sort().map(([id, value]) => ({ id, value })) };
        }
        if (/SELECT COUNT\(\*\)/.test(sql)) return { rows: [{ count: this.data.size }] };
        if (/SELECT split_part/.test(sql)) {
            const counts = new Map();
            for (const key of this.data.keys()) counts.set(key.split('_')[0], (counts.get(key.split('_')[0]) || 0) + 1);
            return { rows: [...counts].map(([prefix, count]) => ({ prefix, count })).sort((a, b) => b.count - a.count).slice(0, params[0]) };
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
    check('strips accidental surrounding quotes from Render values',
        normalizeDatabaseUrl('  "postgresql://user:pass@host:5432/db"  ')
            === 'postgresql://user:pass@host:5432/db');
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
    await db.set('xp_guild_user1', { xp: 1 });
    await db.set('xp_guild_user2', { xp: 2 });
    await db.set('other_key', { xp: 3 });
    const firstPage = await db.scanPrefix('xp_guild_', { limit: 1 });
    const secondPage = await db.scanPrefix('xp_guild_', { limit: 1, cursor: firstPage.nextCursor });
    check('prefix scan is indexed, ordered, and paginated',
        firstPage.rows.length === 1 && secondPage.rows.length === 1
        && firstPage.rows[0].id !== secondPage.rows[0].id);
    const prefixRows = await db.allByPrefix('xp_guild_', { pageSize: 1 });
    check('allByPrefix collects pages without unrelated keys',
        prefixRows.length === 2 && prefixRows.every((row) => row.id.startsWith('xp_guild_')));
    const stats = await db.prefixStats();
    check('prefixStats aggregates in the database without loading JSON values',
        stats.find((row) => row.prefix === 'xp')?.count === 2);
    check('keyCount uses a scalar database aggregate', await db.keyCount() === 5);
    check('deletePrefix deletes only the selected key range',
        await db.deletePrefix('xp_guild_') === 2 && await db.get('other_key') != null);

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
