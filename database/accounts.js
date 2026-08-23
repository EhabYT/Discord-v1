const crypto = require('crypto');
const { getPool } = require('./index');

const ACCOUNT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    display_name VARCHAR(64) NOT NULL,
    username VARCHAR(24) NOT NULL,
    email TEXT,
    email_verified_at TIMESTAMPTZ,
    avatar_url TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deactivated', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower
    ON accounts (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower
    ON accounts (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_credentials (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_auth_limits (
    bucket_key TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL,
    blocked_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS account_email_tokens (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_email_tokens_account_purpose
    ON account_email_tokens (account_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS account_identities (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider VARCHAR(24) NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_username TEXT,
    provider_avatar_url TEXT,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, provider_user_id),
    UNIQUE (account_id, provider)
);
CREATE INDEX IF NOT EXISTS account_identities_account
    ON account_identities (account_id);

CREATE TABLE IF NOT EXISTS account_security_events (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS account_security_events_account_time
    ON account_security_events (account_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS account_session_metadata (
    sid TEXT PRIMARY KEY REFERENCES dashboard_sessions(sid) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(64),
    device_label VARCHAR(160)
);
CREATE INDEX IF NOT EXISTS account_session_metadata_account
    ON account_session_metadata (account_id, last_seen_at DESC);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_email_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_session_metadata ENABLE ROW LEVEL SECURITY;
`;

function normalizeUsername(value) {
    let username = String(value || '').normalize('NFKC').toLowerCase()
        .replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (!username) username = 'user';
    if (!/^[a-z]/.test(username)) username = `u_${username}`;
    return username.slice(0, 24).padEnd(3, '_');
}

function hashAccountToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function safeAccount(row) {
    if (!row) return null;
    return {
        id: row.id,
        displayName: row.display_name,
        username: row.username,
        email: row.email || null,
        emailVerified: !!row.email_verified_at,
        avatarUrl: row.avatar_url || row.provider_avatar_url || null,
        status: row.status,
        createdAt: row.created_at,
        linkedDiscord: row.provider_user_id ? {
            id: row.provider_user_id,
            username: row.provider_username || null,
            avatar: row.provider_avatar_url || null,
        } : null,
    };
}

class AccountStore {
    constructor(pool = getPool()) {
        this.pool = pool;
        this.initializing = null;
    }

    ready() {
        if (!this.pool) return Promise.reject(new Error('DATABASE_URL is not configured'));
        if (!this.initializing) {
            this.initializing = this.pool.query(ACCOUNT_SCHEMA_SQL).catch(err => {
                this.initializing = null;
                throw err;
            });
        }
        return this.initializing;
    }

    async byDiscordId(discordId, executor = this.pool) {
        const result = await executor.query(`
            SELECT a.*, i.provider_user_id, i.provider_username, i.provider_avatar_url
            FROM accounts a
            JOIN account_identities i ON i.account_id = a.id
            WHERE i.provider = 'discord' AND i.provider_user_id = $1
        `, [String(discordId)]);
        return safeAccount(result.rows[0]);
    }

    async byId(accountId, executor = this.pool) {
        const result = await executor.query(`
            SELECT a.*, i.provider_user_id, i.provider_username, i.provider_avatar_url
            FROM accounts a
            LEFT JOIN account_identities i
              ON i.account_id = a.id AND i.provider = 'discord'
            WHERE a.id = $1
        `, [String(accountId)]);
        return safeAccount(result.rows[0]);
    }

    async uniqueUsername(executor, preferred, discordId) {
        const base = normalizeUsername(preferred);
        for (let attempt = 0; attempt < 20; attempt++) {
            const suffix = attempt === 0 ? '' : `_${String(discordId).slice(-4)}${attempt === 1 ? '' : attempt}`;
            const candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
            const exists = await executor.query('SELECT 1 FROM accounts WHERE LOWER(username) = LOWER($1)', [candidate]);
            if (!exists.rows.length) return candidate;
        }
        return `user_${crypto.randomBytes(6).toString('hex')}`.slice(0, 24);
    }

    async byEmail(email) {
        await this.ready();
        const result = await this.pool.query(`
            SELECT a.*, i.provider_user_id, i.provider_username, i.provider_avatar_url
            FROM accounts a
            LEFT JOIN account_identities i ON i.account_id = a.id AND i.provider = 'discord'
            WHERE LOWER(a.email) = LOWER($1)
            LIMIT 1
        `, [String(email)]);
        return safeAccount(result.rows[0]);
    }

    async issueEmailToken(accountId, purpose, ttlMs) {
        await this.ready();
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = hashAccountToken(token);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
                UPDATE account_email_tokens SET used_at = NOW()
                WHERE account_id = $1 AND purpose = $2 AND used_at IS NULL
            `, [accountId, purpose]);
            await client.query(`
                INSERT INTO account_email_tokens (id, account_id, purpose, token_hash, expires_at)
                VALUES ($1, $2, $3, $4, $5)
            `, [crypto.randomUUID(), accountId, purpose, tokenHash, new Date(Date.now() + ttlMs)]);
            await client.query('COMMIT');
            return token;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
            throw err;
        } finally { client.release(); }
    }

    async verifyEmailToken(token, requestId = null) {
        await this.ready();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const found = await client.query(`
                SELECT account_id FROM account_email_tokens
                WHERE token_hash = $1 AND purpose = 'verify_email'
                  AND used_at IS NULL AND expires_at > NOW()
                FOR UPDATE
            `, [hashAccountToken(token)]);
            const accountId = found.rows[0]?.account_id;
            if (!accountId) { await client.query('ROLLBACK'); return null; }
            await client.query('UPDATE account_email_tokens SET used_at = NOW() WHERE token_hash = $1', [hashAccountToken(token)]);
            await client.query('UPDATE accounts SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [accountId]);
            await client.query(`INSERT INTO account_security_events (id, account_id, event_type, request_id, metadata)
                VALUES ($1, $2, 'email_verified', $3, '{}'::jsonb)`, [crypto.randomUUID(), accountId, requestId]);
            const account = await this.byId(accountId, client);
            await client.query('COMMIT');
            return account;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
            throw err;
        } finally { client.release(); }
    }

    async resetPasswordWithToken(token, passwordHash, requestId = null) {
        await this.ready();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const found = await client.query(`
                SELECT account_id FROM account_email_tokens
                WHERE token_hash = $1 AND purpose = 'reset_password'
                  AND used_at IS NULL AND expires_at > NOW()
                FOR UPDATE
            `, [hashAccountToken(token)]);
            const accountId = found.rows[0]?.account_id;
            if (!accountId) { await client.query('ROLLBACK'); return false; }
            await client.query('UPDATE account_email_tokens SET used_at = NOW() WHERE token_hash = $1', [hashAccountToken(token)]);
            await client.query(`UPDATE account_credentials SET password_hash = $1, changed_at = NOW()
                WHERE account_id = $2`, [passwordHash, accountId]);
            await client.query(`DELETE FROM dashboard_sessions
                WHERE sess #>> '{account,id}' = $1`, [String(accountId)]);
            await client.query(`INSERT INTO account_security_events (id, account_id, event_type, request_id, metadata)
                VALUES ($1, $2, 'password_reset_completed', $3, '{"sessionsRevoked":true}'::jsonb)`,
            [crypto.randomUUID(), accountId, requestId]);
            await client.query('COMMIT');
            return true;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
            throw err;
        } finally { client.release(); }
    }

    async consumeAuthLimit(bucketKey, { max, windowMs, blockMs }) {
        await this.ready();
        const client = await this.pool.connect();
        const now = Date.now();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`auth-limit:${bucketKey}`]);
            const result = await client.query('SELECT * FROM account_auth_limits WHERE bucket_key = $1', [bucketKey]);
            const row = result.rows[0];
            if (row?.blocked_until && new Date(row.blocked_until).getTime() > now) {
                await client.query('COMMIT');
                return { allowed: false, retryAfter: Math.ceil((new Date(row.blocked_until).getTime() - now) / 1000) };
            }
            const expired = !row || new Date(row.window_started_at).getTime() + windowMs <= now;
            const count = expired ? 1 : Number(row.attempt_count) + 1;
            const blockedUntil = count > max ? new Date(now + blockMs) : null;
            await client.query(`
                INSERT INTO account_auth_limits (bucket_key, window_started_at, attempt_count, blocked_until)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (bucket_key) DO UPDATE SET
                    window_started_at = EXCLUDED.window_started_at,
                    attempt_count = EXCLUDED.attempt_count,
                    blocked_until = EXCLUDED.blocked_until
            `, [bucketKey, new Date(expired ? now : new Date(row.window_started_at).getTime()), count, blockedUntil]);
            await client.query('COMMIT');
            return { allowed: count <= max, retryAfter: blockedUntil ? Math.ceil(blockMs / 1000) : 0 };
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
            throw err;
        } finally {
            client.release();
        }
    }

    async createLocalAccount({ displayName, username, email, passwordHash }, requestId = null) {
        await this.ready();
        const client = await this.pool.connect();
        const accountId = crypto.randomUUID();
        try {
            await client.query('BEGIN');
            await client.query(`
                INSERT INTO accounts (id, display_name, username, email)
                VALUES ($1, $2, $3, $4)
            `, [accountId, displayName, username, email]);
            await client.query('INSERT INTO account_credentials (account_id, password_hash) VALUES ($1, $2)', [accountId, passwordHash]);
            await client.query(`
                INSERT INTO account_security_events (id, account_id, event_type, request_id, metadata)
                VALUES ($1, $2, 'account_registered', $3, '{}'::jsonb)
            `, [crypto.randomUUID(), accountId, requestId]);
            const account = await this.byId(accountId, client);
            await client.query('COMMIT');
            return account;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
            throw err;
        } finally {
            client.release();
        }
    }

    async credentialByLogin(identifier) {
        await this.ready();
        const result = await this.pool.query(`
            SELECT a.*, c.password_hash, i.provider_user_id, i.provider_username, i.provider_avatar_url
            FROM accounts a
            JOIN account_credentials c ON c.account_id = a.id
            LEFT JOIN account_identities i ON i.account_id = a.id AND i.provider = 'discord'
            WHERE LOWER(a.email) = LOWER($1) OR LOWER(a.username) = LOWER($1)
            LIMIT 1
        `, [identifier]);
        const row = result.rows[0];
        return row ? { account: safeAccount(row), passwordHash: row.password_hash } : null;
    }

    async ensureDiscordAccount(discordUser, requestId = null) {
        await this.ready();
        const client = await this.pool.connect();
        const discordId = String(discordUser.id);
        try {
            await client.query('BEGIN');
            await client.query(
                'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
                [`account:discord:${discordId}`]
            );
            let account = await this.byDiscordId(discordId, client);
            if (account) {
                await client.query(`
                    UPDATE account_identities
                    SET provider_username = $1, provider_avatar_url = $2, updated_at = NOW()
                    WHERE provider = 'discord' AND provider_user_id = $3
                `, [discordUser.username || null, discordUser.avatar || null, discordId]);
                account = await this.byDiscordId(discordId, client);
                await client.query('COMMIT');
                return account;
            }

            const accountId = crypto.randomUUID();
            const username = await this.uniqueUsername(client, discordUser.username, discordId);
            await client.query(`
                INSERT INTO accounts (id, display_name, username, avatar_url)
                VALUES ($1, $2, $3, $4)
            `, [accountId, String(discordUser.username || 'Discord User').slice(0, 64), username, null]);
            await client.query(`
                INSERT INTO account_identities
                    (account_id, provider, provider_user_id, provider_username, provider_avatar_url)
                VALUES ($1, 'discord', $2, $3, $4)
            `, [accountId, discordId, discordUser.username || null, discordUser.avatar || null]);
            await client.query(`
                INSERT INTO account_security_events (id, account_id, event_type, request_id, metadata)
                VALUES ($1, $2, 'account_provisioned_discord', $3, '{}'::jsonb)
            `, [crypto.randomUUID(), accountId, requestId]);
            account = await this.byId(accountId, client);
            await client.query('COMMIT');
            return account;
        } catch (err) {
            try { await client.query('ROLLBACK'); } catch { /* preserve original */ }
            throw err;
        } finally {
            client.release();
        }
    }
}

let sharedStore;
function getAccountStore() {
    if (!sharedStore) sharedStore = new AccountStore();
    return sharedStore;
}

module.exports = { ACCOUNT_SCHEMA_SQL, normalizeUsername, hashAccountToken, safeAccount, AccountStore, getAccountStore };
