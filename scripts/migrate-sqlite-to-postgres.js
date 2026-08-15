#!/usr/bin/env node
/** One-time, idempotent migration from legacy quick.db SQLite to Supabase. */

const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
const source = path.resolve(sourceArg >= 0 ? args[sourceArg + 1] : 'database/json.sqlite');
const dryRun = args.includes('--dry-run');

if (sourceArg >= 0 && !args[sourceArg + 1]) {
    console.error('Missing value after --source');
    process.exit(2);
}

let raw;
try {
    raw = execFileSync(process.env.PYTHON || 'python3', [
        path.join(__dirname, 'read-quickdb-sqlite.py'), source,
    ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
} catch (err) {
    console.error('Could not read the legacy SQLite database:', err.stderr || err.message);
    process.exit(1);
}

const rows = JSON.parse(raw);
const prefixes = {};
for (const row of rows) {
    const prefix = row.id.split('_')[0] || row.id;
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
}
console.log(`Validated ${rows.length} legacy records from ${source}`);
console.log('Largest groups:', Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 10));

if (dryRun) {
    console.log('Dry run complete; Supabase was not modified.');
    process.exit(0);
}

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for import. Use --dry-run to validate only.');
    process.exit(2);
}

(async () => {
    const { getPool } = require('../database/index');
    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            CREATE TABLE IF NOT EXISTS bot_kv (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE bot_kv ENABLE ROW LEVEL SECURITY;
        `);
        for (const row of rows) {
            await client.query(`
                INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            `, [row.id, JSON.stringify(row.value === undefined ? null : row.value)]);
        }
        await client.query('COMMIT');
        console.log(`Migrated ${rows.length} records to Supabase PostgreSQL.`);
        console.log('The SQLite source was not changed. Keep it as a backup until verification is complete.');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
})().catch((err) => {
    console.error('Migration failed; transaction rolled back:', err.message);
    process.exit(1);
});
