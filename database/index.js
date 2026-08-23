const { Pool } = require('pg');

const isTestProcess = process.env.NODE_ENV === 'test'
    || process.argv.some((arg) => /(?:^|[\\/])tests[\\/]/.test(arg));

function normalizePrefixOptions(prefix, options = {}) {
    const cleanPrefix = String(prefix || '');
    if (!cleanPrefix || cleanPrefix.length > 200) throw new Error('prefix must be 1-200 characters');
    const limit = Math.min(5000, Math.max(1, Number(options.limit) || 1000));
    const cursor = options.cursor == null ? null : String(options.cursor);
    if (cursor && !cursor.startsWith(cleanPrefix)) throw new Error('cursor must belong to prefix');
    const likePrefix = `${cleanPrefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    return { prefix: cleanPrefix, likePrefix, limit, cursor };
}

class MemoryDatabase {
    constructor() { this.data = new Map(); }
    ready() { return Promise.resolve(true); }
    withAdvisoryLocks(keys, fn) {
        return fn(this);
    }
    get(key) {
        return Promise.resolve(this.data.has(String(key)) ? structuredClone(this.data.get(String(key))) : null);
    }
    set(key, value) {
        this.data.set(String(key), structuredClone(value === undefined ? null : value));
        return Promise.resolve(value);
    }
    delete(key) { return Promise.resolve(this.data.delete(String(key))); }
    all() {
        return Promise.resolve([...this.data.entries()].map(([id, value]) => ({ id, value: structuredClone(value) })));
    }
    scanPrefix(prefix, options = {}) {
        const normalized = normalizePrefixOptions(prefix, options);
        const matches = [...this.data.entries()]
            .filter(([id]) => id.startsWith(normalized.prefix) && (!normalized.cursor || id > normalized.cursor))
            .sort(([a], [b]) => a.localeCompare(b));
        const page = matches.slice(0, normalized.limit)
            .map(([id, value]) => ({ id, value: structuredClone(value) }));
        return Promise.resolve({
            rows: page,
            nextCursor: matches.length > normalized.limit ? page.at(-1).id : null,
        });
    }
    allByPrefix(prefix, options = {}) {
        return collectPrefixRows(this, prefix, options);
    }
    deletePrefix(prefix) {
        const normalized = normalizePrefixOptions(prefix);
        let deleted = 0;
        for (const key of [...this.data.keys()]) {
            if (key.startsWith(normalized.prefix)) { this.data.delete(key); deleted++; }
        }
        return Promise.resolve(deleted);
    }
    keyCount() { return Promise.resolve(this.data.size); }
    prefixStats(limit = 30) {
        const counts = new Map();
        for (const key of this.data.keys()) {
            const prefix = key.split('_')[0] || key;
            counts.set(prefix, (counts.get(prefix) || 0) + 1);
        }
        return Promise.resolve([...counts].map(([prefix, count]) => ({ prefix, count }))
            .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))
            .slice(0, Math.min(100, Math.max(1, Number(limit) || 30))));
    }
}

let sharedPool = null;
let poolConfigError = null;

function normalizeDatabaseUrl(value) {
    let out = String(value || '').trim();
    if ((out.startsWith('"') && out.endsWith('"'))
        || (out.startsWith("'") && out.endsWith("'"))) {
        out = out.slice(1, -1).trim();
    }
    return out;
}

function databaseConfigIssue(value = process.env.DATABASE_URL) {
    const connectionString = normalizeDatabaseUrl(value);
    if (!connectionString) return 'DATABASE_URL is not configured';
    let parsed;
    try { parsed = new URL(connectionString); }
    catch { return 'DATABASE_URL must be a complete postgresql:// connection URI'; }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        return 'DATABASE_URL must start with postgresql://';
    }
    if (!parsed.hostname || /^(base|host|hostname)$/i.test(parsed.hostname)
        || /\[|\]|YOUR-|PROJECT_REF/i.test(connectionString)) {
        return 'DATABASE_URL contains a placeholder hostname; copy the full Supabase Session Pooler URI';
    }
    if (!parsed.username || !parsed.password) {
        return 'DATABASE_URL must include the Supabase database username and password';
    }
    return null;
}

function getPool() {
    if (sharedPool) return sharedPool;
    const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
    poolConfigError = databaseConfigIssue(connectionString);
    if (poolConfigError) return null;
    const hosted = !/^(postgres(?:ql)?:\/\/(?:localhost|127\.0\.0\.1))/i.test(connectionString);
    sharedPool = new Pool({
        connectionString,
        max: Math.max(1, Math.min(10, Number(process.env.DATABASE_POOL_SIZE) || 5)),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ssl: hosted && process.env.DATABASE_SSL !== 'false'
            ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' }
            : false,
    });
    return sharedPool;
}

async function collectPrefixRows(database, prefix, { pageSize = 1000, maxRows = 50_000 } = {}) {
    const rows = [];
    let cursor = null;
    do {
        const page = await database.scanPrefix(prefix, { limit: pageSize, cursor });
        rows.push(...page.rows);
        if (rows.length > maxRows) throw new Error(`Prefix scan exceeded ${maxRows} rows`);
        cursor = page.nextCursor;
    } while (cursor);
    return rows;
}

class PostgresDatabase {
    constructor(pool = getPool(), { initialized = false } = {}) {
        this.pool = pool;
        this.initializing = initialized ? Promise.resolve(true) : null;
    }

    ready() {
        if (!this.pool) return Promise.reject(new Error(poolConfigError || databaseConfigIssue()));
        if (!this.initializing) {
            const attempt = this.pool.query(`
                CREATE TABLE IF NOT EXISTS bot_kv (
                    key TEXT PRIMARY KEY,
                    value JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS bot_kv_key_prefix
                    ON bot_kv (key text_pattern_ops);
                ALTER TABLE bot_kv ENABLE ROW LEVEL SECURITY;
            `).then(() => true);
            this.initializing = attempt.catch((err) => {
                // A transient Supabase/pooler outage must not poison this
                // process forever; the next health/login request may retry.
                this.initializing = null;
                throw err;
            });
        }
        return this.initializing;
    }

    async withAdvisoryLocks(keys, fn) {
        await this.ready();
        const ordered = [...new Set(keys.map(String))].sort();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const key of ordered) {
                await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
            }
            const transactionDb = new PostgresDatabase(client, { initialized: true });
            const result = await fn(transactionDb);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // Preserve the operation error; a broken connection is discarded
                // by pg when released below.
            }
            throw err;
        } finally {
            client.release();
        }
    }

    async get(key) {
        await this.ready();
        const result = await this.pool.query('SELECT value FROM bot_kv WHERE key = $1', [String(key)]);
        return result.rows.length ? result.rows[0].value : null;
    }

    async set(key, value) {
        await this.ready();
        const safeValue = value === undefined ? null : value;
        await this.pool.query(`
            INSERT INTO bot_kv (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [String(key), JSON.stringify(safeValue)]);
        return safeValue;
    }

    async delete(key) {
        await this.ready();
        const result = await this.pool.query('DELETE FROM bot_kv WHERE key = $1', [String(key)]);
        return result.rowCount > 0;
    }

    async all() {
        await this.ready();
        const result = await this.pool.query('SELECT key AS id, value FROM bot_kv ORDER BY key');
        return result.rows;
    }

    async scanPrefix(prefix, options = {}) {
        await this.ready();
        const normalized = normalizePrefixOptions(prefix, options);
        const result = await this.pool.query(`
            SELECT key AS id, value
            FROM bot_kv
            WHERE key LIKE $1 ESCAPE '\\'
              AND ($2::text IS NULL OR key > $2)
            ORDER BY key
            LIMIT $3
        `, [normalized.likePrefix, normalized.cursor, normalized.limit]);
        return {
            rows: result.rows,
            nextCursor: result.rows.length === normalized.limit ? result.rows.at(-1).id : null,
        };
    }

    allByPrefix(prefix, options = {}) {
        return collectPrefixRows(this, prefix, options);
    }

    async deletePrefix(prefix) {
        await this.ready();
        const normalized = normalizePrefixOptions(prefix);
        const result = await this.pool.query(
            "DELETE FROM bot_kv WHERE key LIKE $1 ESCAPE '\\'",
            [normalized.likePrefix]
        );
        return result.rowCount;
    }

    async keyCount() {
        await this.ready();
        const result = await this.pool.query('SELECT COUNT(*)::int AS count FROM bot_kv');
        return result.rows[0]?.count || 0;
    }

    async prefixStats(limit = 30) {
        await this.ready();
        const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
        const result = await this.pool.query(`
            SELECT split_part(key, '_', 1) AS prefix, COUNT(*)::int AS count
            FROM bot_kv
            GROUP BY 1
            ORDER BY count DESC, prefix ASC
            LIMIT $1
        `, [safeLimit]);
        return result.rows;
    }
}

const db = isTestProcess ? new MemoryDatabase() : new PostgresDatabase();

function getCached(key) { return db.get(key); }
async function setCached(key, value) { await db.set(key, value); }
async function deleteCached(key) { await db.delete(key); }

async function closePool() {
    if (!sharedPool) return;
    const pool = sharedPool;
    sharedPool = null;
    poolConfigError = null;
    await pool.end();
}

module.exports = {
    db, getCached, setCached, deleteCached,
    getPool, closePool, normalizeDatabaseUrl, databaseConfigIssue,
    normalizePrefixOptions, collectPrefixRows, MemoryDatabase, PostgresDatabase,
};
