const session = require('express-session');
const { getPool } = require('../../database/index');

function expiresAt(sess) {
    const explicit = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    if (Number.isFinite(explicit)) return explicit;
    const maxAge = Number(sess?.cookie?.maxAge);
    return Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 86_400_000);
}

/** PostgreSQL session store shared with the Supabase bot database. */
class PostgresSessionStore extends session.Store {
    constructor(pool = getPool()) {
        super();
        if (!pool) throw new Error('DATABASE_URL is not configured');
        this.pool = pool;
        this.initializing = null;
        this.pruneTimer = setInterval(() => {
            this.ensureReady().then(() => this.pool.query(
                'DELETE FROM dashboard_sessions WHERE expires <= NOW()'
            )).catch(() => {});
        }, 15 * 60 * 1000);
        this.pruneTimer.unref();
    }

    ensureReady() {
        if (!this.initializing) {
            const attempt = this.pool.query(`
                CREATE TABLE IF NOT EXISTS dashboard_sessions (
                    sid TEXT PRIMARY KEY,
                    sess JSONB NOT NULL,
                    expires TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS dashboard_sessions_expires
                    ON dashboard_sessions (expires);
                ALTER TABLE dashboard_sessions ENABLE ROW LEVEL SECURITY;
            `);
            this.initializing = attempt.catch((err) => {
                this.initializing = null;
                throw err;
            });
        }
        return this.initializing;
    }

    async _get(sid) {
        await this.ensureReady();
        const result = await this.pool.query(
            'SELECT sess FROM dashboard_sessions WHERE sid = $1 AND expires > NOW()', [sid]
        );
        return result.rows.length ? result.rows[0].sess : null;
    }

    get(sid, callback) { this._get(sid).then((v) => callback(null, v), callback); }

    set(sid, sess, callback = () => {}) {
        this.ensureReady().then(() => this.pool.query(`
            INSERT INTO dashboard_sessions (sid, sess, expires) VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires = EXCLUDED.expires
        `, [sid, JSON.stringify(sess), new Date(expiresAt(sess))]))
            .then(() => callback(null), callback);
    }

    destroy(sid, callback = () => {}) {
        this.ensureReady().then(() => this.pool.query('DELETE FROM dashboard_sessions WHERE sid = $1', [sid]))
            .then(() => callback(null), callback);
    }

    touch(sid, sess, callback = () => {}) {
        this.ensureReady().then(() => this.pool.query(
            'UPDATE dashboard_sessions SET expires = $1 WHERE sid = $2',
            [new Date(expiresAt(sess)), sid]
        )).then(() => callback(null), callback);
    }
}

/**
 * Bounded emergency store used only when DATABASE_URL is absent. It keeps the
 * diagnostics page reachable without triggering express-session's unbounded
 * production MemoryStore warning. OAuth status is disabled in this state.
 */
class BoundedMemorySessionStore extends session.Store {
    constructor(limit = 1000) {
        super();
        this.limit = limit;
        this.sessions = new Map();
    }

    _prune() {
        const now = Date.now();
        for (const [sid, row] of this.sessions) if (row.expires <= now) this.sessions.delete(sid);
        while (this.sessions.size > this.limit) this.sessions.delete(this.sessions.keys().next().value);
    }

    get(sid, callback) {
        this._prune();
        const row = this.sessions.get(sid);
        callback(null, row ? structuredClone(row.sess) : null);
    }

    set(sid, sess, callback = () => {}) {
        this.sessions.set(sid, { sess: structuredClone(sess), expires: expiresAt(sess) });
        this._prune();
        callback(null);
    }

    destroy(sid, callback = () => {}) { this.sessions.delete(sid); callback(null); }
    touch(sid, sess, callback = () => {}) {
        const row = this.sessions.get(sid);
        if (row) row.expires = expiresAt(sess);
        callback(null);
    }
}

function createSessionStore() {
    const pool = getPool();
    return pool ? new PostgresSessionStore(pool) : new BoundedMemorySessionStore();
}

module.exports = {
    PostgresSessionStore, BoundedMemorySessionStore, createSessionStore, expiresAt,
};
