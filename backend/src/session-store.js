const fs = require('fs');
const os = require('os');
const path = require('path');
const session = require('express-session');
const Database = require('better-sqlite3');

function defaultSessionPath() {
    const isTest = process.env.NODE_ENV === 'test'
        || process.argv.some((arg) => /(?:^|[\\/])tests[\\/]/.test(arg));
    if (isTest) return path.join(os.tmpdir(), `eb-bot-sessions-${process.pid}.sqlite`);
    if (process.env.SESSION_DATABASE_PATH) return path.resolve(process.env.SESSION_DATABASE_PATH);
    if (process.env.DATABASE_PATH) return path.join(path.dirname(path.resolve(process.env.DATABASE_PATH)), 'sessions.sqlite');
    return path.join(__dirname, '..', '..', 'database', 'sessions.sqlite');
}

function expiresAt(sess) {
    const explicit = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    if (Number.isFinite(explicit)) return explicit;
    const maxAge = Number(sess?.cookie?.maxAge);
    return Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 86_400_000);
}

/**
 * Minimal persistent express-session store backed by better-sqlite3.
 *
 * Express's default MemoryStore leaks memory, loses every OAuth state on a
 * restart and explicitly warns against production use. This store uses the
 * native SQLite dependency already required by the bot, so no second database
 * driver or external service is needed.
 */
class SQLiteSessionStore extends session.Store {
    constructor(filePath = defaultSessionPath()) {
        super();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS dashboard_sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expires INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS dashboard_sessions_expires
                ON dashboard_sessions (expires);
        `);
        this.read = this.db.prepare('SELECT sess, expires FROM dashboard_sessions WHERE sid = ?');
        this.write = this.db.prepare(`
            INSERT INTO dashboard_sessions (sid, sess, expires) VALUES (?, ?, ?)
            ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
        `);
        this.remove = this.db.prepare('DELETE FROM dashboard_sessions WHERE sid = ?');
        this.refresh = this.db.prepare('UPDATE dashboard_sessions SET expires = ? WHERE sid = ?');
        this.prune = this.db.prepare('DELETE FROM dashboard_sessions WHERE expires <= ?');
        this.pruneTimer = setInterval(() => {
            try { this.prune.run(Date.now()); } catch { /* next store operation reports persistent failures */ }
        }, 15 * 60 * 1000);
        this.pruneTimer.unref();
    }

    get(sid, callback) {
        try {
            const row = this.read.get(sid);
            if (!row) return callback(null, null);
            if (row.expires <= Date.now()) {
                this.remove.run(sid);
                return callback(null, null);
            }
            return callback(null, JSON.parse(row.sess));
        } catch (err) {
            return callback(err);
        }
    }

    set(sid, sess, callback = () => {}) {
        try {
            this.write.run(sid, JSON.stringify(sess), expiresAt(sess));
            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    destroy(sid, callback = () => {}) {
        try {
            this.remove.run(sid);
            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    touch(sid, sess, callback = () => {}) {
        try {
            this.refresh.run(expiresAt(sess), sid);
            callback(null);
        } catch (err) {
            callback(err);
        }
    }

    close() {
        clearInterval(this.pruneTimer);
        this.db.close();
    }
}

module.exports = { SQLiteSessionStore, defaultSessionPath, expiresAt };
