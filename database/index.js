const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const isTestProcess = process.env.NODE_ENV === 'test'
    || process.argv.some((arg) => /(?:^|[\\/])tests[\\/]/.test(arg));

// Local JSON snapshot used ONLY for the DB-less development fallback (never
// in tests, never when DATABASE_URL is configured). Dashboard configs such
// as reaction-role panels otherwise vanish on every restart, leaving dead
// buttons behind. Sessions still reset on restart by design.
const FALLBACK_SNAPSHOT = path.join(__dirname, 'ephemeral-fallback.json');

function normalizePrefixOptions(prefix, options = {}) {
    const cleanPrefix = String(prefix || '');
    if (!cleanPrefix || cleanPrefix.length > 200) throw new Error('prefix must be 1-200 characters');
    const limit = Math.min(5000, Math.max(1, Number(options.limit) || 1000));
    const cursor = options.cursor == null ? null : String(options.cursor);
    if (cursor && !cursor.startsWith(cleanPrefix)) throw new Error('cursor must belong to prefix');
    const likePrefix = `${cleanPrefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    return { prefix: cleanPrefix, likePrefix, limit, cursor };
}

// Leaderboard orderings shared by the Memory and Postgres adapters so both
// return identical rankings. SQL guards each field with a numeric regex:
// a hand-edited or legacy row holding a string must sort as 0, never abort
// the query with a cast error (the old JS sort rendered such rows as NaN).
function numField(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

const TOP_SORTS = {
    xp: {
        sql: `(CASE WHEN value->>'textLevel' ~ '^-?[0-9]+$' THEN (value->>'textLevel')::bigint ELSE 0 END * 100 + CASE WHEN value->>'textXp' ~ '^-?[0-9]+$' THEN (value->>'textXp')::bigint ELSE 0 END)`,
        score: (value) => numField(value?.textLevel) * 100 + numField(value?.textXp),
    },
    messages: {
        sql: `CASE WHEN value->>'messages' ~ '^-?[0-9]+$' THEN (value->>'messages')::bigint ELSE 0 END`,
        score: (value) => numField(value?.messages),
    },
    voice: {
        sql: `CASE WHEN value->>'voiceTime' ~ '^-?[0-9]+$' THEN (value->>'voiceTime')::bigint ELSE 0 END`,
        score: (value) => numField(value?.voiceTime),
    },
};

function normalizeTopOptions(prefix, options = {}) {
    const base = normalizePrefixOptions(prefix, { limit: 1000 });
    const sort = String(options.sort || 'xp');
    if (!TOP_SORTS[sort]) throw new Error(`unknown top sort: ${sort}`);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 15));
    return { prefix: base.prefix, likePrefix: base.likePrefix, limit, sort };
}

function normalizeScoreThreshold(score) {
    const n = Number(score);
    return Number.isFinite(n) ? Math.floor(n) : 0;
}

class MemoryDatabase {
    constructor({ persist = false, snapshotPath = FALLBACK_SNAPSHOT } = {}) {
        this.data = new Map();
        this.persist = persist === true && !isTestProcess;
        this.snapshotPath = snapshotPath;
        this._lastMtimeMs = 0;
        this._lastCheckMs = 0;
        this._snapshotDirty = false;
        this._saveTimer = null;
        if (this.persist) this.loadSnapshot();
    }
    loadSnapshot() {
        let raw = null;
        try { raw = fs.readFileSync(this.snapshotPath, 'utf8'); } catch { return; }
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [key, value] of Object.entries(parsed)) this.data.set(String(key), value);
            }
            try {
                const stat = fs.statSync(this.snapshotPath);
                this._lastMtimeMs = stat.mtimeMs || 0;
            } catch { /* ignore */ }
        } catch {
            // A corrupt snapshot must never prevent startup; start empty.
        }
    }
    _maybeReload() {
        if (!this.persist) return;
        // Throttle the statSync to max once per second: every db.get/mget/scan
        // previously issued a blocking stat syscall, so a single dashboard
        // overview (11 reads, now 1 mget) still stalled the event loop on
        // filesystem metadata. External snapshot edits surface within ~1s.
        const now = Date.now();
        if (now - this._lastCheckMs < 1000) return;
        this._lastCheckMs = now;
        try {
            const stat = fs.statSync(this.snapshotPath);
            const mtime = stat.mtimeMs || 0;
            if (mtime > this._lastMtimeMs) {
                const raw = fs.readFileSync(this.snapshotPath, 'utf8');
                const parsed = JSON.parse(raw);
                this.data.clear();
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    for (const [key, value] of Object.entries(parsed)) this.data.set(String(key), value);
                }
                this._lastMtimeMs = mtime;
            }
        } catch { /* reload is best-effort; keep in-memory on failure */ }
    }
    saveSnapshot() {
        if (!this.persist) return;
        // Debounce to max one write per second with a trailing flush: every
        // set/delete previously ran JSON.stringify over the ENTIRE database
        // plus two blocking syscalls, so XP updates on a busy guild (one per
        // message) stalled the event loop on O(DB) work each time. The
        // in-memory Map stays authoritative, so reads never observe stale
        // data; only a crash inside the 1s window loses the tail. Ephemeral
        // mode is explicitly non-durable across restarts already.
        this._snapshotDirty = true;
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.flushSnapshot();
        }, 1000);
        // Deliberately NOT unref'd: a pending snapshot must flush before a
        // one-shot script or a clean shutdown exits, otherwise the trailing
        // second of dashboard config would vanish silently. Timers only exist
        // in ephemeral-fallback mode (never in tests, never with Postgres).
    }
    flushSnapshot() {
        if (!this.persist || !this._snapshotDirty) return;
        this._snapshotDirty = false;
        try {
            fs.mkdirSync(path.dirname(this.snapshotPath), { recursive: true });
            fs.writeFileSync(this.snapshotPath, JSON.stringify(Object.fromEntries(this.data)), 'utf8');
            try {
                const stat = fs.statSync(this.snapshotPath);
                this._lastMtimeMs = stat.mtimeMs || 0;
                this._lastCheckMs = Date.now();
            } catch { /* ignore */ }
        } catch {
            // Persistence is best-effort; the in-memory state stays authoritative.
            this._snapshotDirty = true;
        }
    }
    ready() { return Promise.resolve(true); }
    withAdvisoryLocks(keys, fn) {
        return fn(this);
    }
    get(key) {
        if (this.persist) this._maybeReload();
        return Promise.resolve(this.data.has(String(key)) ? structuredClone(this.data.get(String(key))) : null);
    }
    mget(keys) {
        if (this.persist) this._maybeReload();
        const list = Array.isArray(keys) ? keys.slice(0, 100) : [];
        const out = {};
        for (const key of list) {
            const k = String(key);
            out[k] = this.data.has(k) ? structuredClone(this.data.get(k)) : null;
        }
        return Promise.resolve(out);
    }
    set(key, value) {
        this.data.set(String(key), structuredClone(value === undefined ? null : value));
        this.saveSnapshot();
        return Promise.resolve(value);
    }
    delete(key) {
        const existed = this.data.delete(String(key));
        if (existed) this.saveSnapshot();
        return Promise.resolve(existed);
    }
    all() {
        if (this.persist) this._maybeReload();
        return Promise.resolve([...this.data.entries()].map(([id, value]) => ({ id, value: structuredClone(value) })));
    }
    scanPrefix(prefix, options = {}) {
        if (this.persist) this._maybeReload();
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
        if (this.persist) this._maybeReload();
        return collectPrefixRows(this, prefix, options);
    }
    topPrefix(prefix, options = {}) {
        if (this.persist) this._maybeReload();
        const normalized = normalizeTopOptions(prefix, options);
        const score = TOP_SORTS[normalized.sort].score;
        return Promise.resolve([...this.data.entries()]
            .filter(([id]) => id.startsWith(normalized.prefix))
            .map(([id, value]) => ({ id, value: structuredClone(value) }))
            .sort((a, b) => score(b.value) - score(a.value))
            .slice(0, normalized.limit));
    }
    rankCounts(prefix, options = {}) {
        if (this.persist) this._maybeReload();
        const normalized = normalizeTopOptions(prefix, options);
        const threshold = normalizeScoreThreshold(options.score);
        const score = TOP_SORTS[normalized.sort].score;
        let above = 0;
        let total = 0;
        for (const [id, value] of this.data.entries()) {
            if (!id.startsWith(normalized.prefix)) continue;
            total += 1;
            if (score(value) > threshold) above += 1;
        }
        return Promise.resolve({ above, total });
    }
    deletePrefix(prefix) {
        const normalized = normalizePrefixOptions(prefix);
        let deleted = 0;
        for (const key of [...this.data.keys()]) {
            if (key.startsWith(normalized.prefix)) { this.data.delete(key); deleted++; }
        }
        if (deleted) this.saveSnapshot();
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

    async mget(keys) {
        await this.ready();
        const list = Array.isArray(keys) ? [...new Set(keys.map(String))].slice(0, 100) : [];
        if (list.length === 0) return {};
        const result = await this.pool.query('SELECT key, value FROM bot_kv WHERE key = ANY($1)', [list]);
        const out = {};
        for (const k of list) out[k] = null;
        for (const row of result.rows) out[row.key] = row.value;
        return out;
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

    // Database-side leaderboard: ranks one prefix by a JSONB score and
    // returns only the top rows. The previous caller transferred up to 50,000
    // full JSONB rows to sort 15 in JavaScript (O(K) network/memory); this is
    // one indexed prefix seek plus a top-N sort in Postgres, transferring
    // O(limit) rows. `sort` is allow-listed so the ORDER BY fragment cannot
    // be injected; unknown sorts throw instead of silently mis-ranking.
    async topPrefix(prefix, options = {}) {
        await this.ready();
        const normalized = normalizeTopOptions(prefix, options);
        const result = await this.pool.query(`
            SELECT key AS id, value
            FROM bot_kv
            WHERE key LIKE $1 ESCAPE '\\'
            ORDER BY ${TOP_SORTS[normalized.sort].sql} DESC
            LIMIT $2
        `, [normalized.likePrefix, normalized.limit]);
        return result.rows;
    }

    // Rank aggregate for /rank: previously the command transferred up to
    // 1,000 full JSONB rows (scanPrefix default page) to count higher scores
    // in JavaScript — and guilds past 1,000 XP rows got WRONG ranks and totals
    // because rows beyond the first page were invisible. Two scalar COUNTs,
    // zero value transfer, correct at any guild size.
    async rankCounts(prefix, options = {}) {
        await this.ready();
        const normalized = normalizeTopOptions(prefix, options);
        const threshold = normalizeScoreThreshold(options.score);
        const result = await this.pool.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE ${TOP_SORTS[normalized.sort].sql} > $2)::int AS above
            FROM bot_kv
            WHERE key LIKE $1 ESCAPE '\\'
        `, [normalized.likePrefix, threshold]);
        const row = result.rows[0] || {};
        return { above: row.above || 0, total: row.total || 0 };
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

// Without a configured DATABASE_URL there is no Postgres to talk to. Rather
// than failing every read, run a process-local in-memory store so the bot
// and dashboard stay fully usable. Dashboard configuration is snapshotted to
// ephemeral-fallback.json so restarts no longer wipe reaction-role panels and
// other settings (sessions still reset on restart; connect Postgres for
// production). Production fail-closeds (OAuth env check, DASHBOARD_AUTH
// refusal, degraded V2 status) stay in force — consumers can distinguish this
// mode via `db.isEphemeralDatabase`.
const useMemoryFallback = !isTestProcess && !!databaseConfigIssue();
const db = isTestProcess
    ? new MemoryDatabase()
    : useMemoryFallback
        ? new MemoryDatabase({ persist: true })
        : new PostgresDatabase();
db.isEphemeralDatabase = useMemoryFallback;

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
