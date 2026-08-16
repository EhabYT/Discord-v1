const { Pool } = require('pg');

const isTestProcess = process.env.NODE_ENV === 'test'
    || process.argv.some((arg) => /(?:^|[\\/])tests[\\/]/.test(arg));

class MemoryDatabase {
    constructor() { this.data = new Map(); }
    ready() { return Promise.resolve(true); }
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
}

let sharedPool = null;
let poolConfigError = null;

function databaseConfigIssue(connectionString = String(process.env.DATABASE_URL || '').trim()) {
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
    const connectionString = String(process.env.DATABASE_URL || '').trim();
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

class PostgresDatabase {
    constructor(pool = getPool()) {
        this.pool = pool;
        this.initializing = null;
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
}

const db = isTestProcess ? new MemoryDatabase() : new PostgresDatabase();

function getCached(key) { return db.get(key); }
async function setCached(key, value) { await db.set(key, value); }
async function deleteCached(key) { await db.delete(key); }

module.exports = {
    db, getCached, setCached, deleteCached,
    getPool, databaseConfigIssue, MemoryDatabase, PostgresDatabase,
};
