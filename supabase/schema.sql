-- EB Bot Supabase schema
-- The application creates these objects automatically; this file is provided
-- for operators who prefer to initialise and inspect the schema in SQL Editor.

CREATE TABLE IF NOT EXISTS public.bot_kv (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_kv_key_prefix
    ON public.bot_kv (key text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.dashboard_sessions (
    sid TEXT PRIMARY KEY,
    sess JSONB NOT NULL,
    expires TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS dashboard_sessions_expires
    ON public.dashboard_sessions (expires);

-- No PostgREST policies are created. The Render server connects as the database
-- owner through Supabase's Session Pooler and can access the tables, while
-- browser-side anon/authenticated API keys cannot read bot data or sessions.
ALTER TABLE public.bot_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_sessions ENABLE ROW LEVEL SECURITY;

-- Internal Dashboard accounts. Discord identities remain separate because
-- Discord guild authorization must continue to use immutable Discord user IDs.
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY,
    display_name VARCHAR(64) NOT NULL,
    username VARCHAR(24) NOT NULL,
    email TEXT,
    email_verified_at TIMESTAMPTZ,
    avatar_url TEXT,
    avatar_key TEXT,
    username_changed_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deactivated', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON public.accounts (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower ON public.accounts (LOWER(email)) WHERE email IS NOT NULL;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS avatar_key TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.account_credentials (
    account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_auth_limits (
    bucket_key TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL,
    blocked_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.account_email_tokens (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    pending_email TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_email_tokens_account_purpose
    ON public.account_email_tokens (account_id, purpose, created_at DESC);
ALTER TABLE public.account_email_tokens ADD COLUMN IF NOT EXISTS pending_email TEXT;

CREATE TABLE IF NOT EXISTS public.account_identities (
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    provider VARCHAR(24) NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_username TEXT,
    provider_avatar_url TEXT,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, provider_user_id),
    UNIQUE (account_id, provider)
);
CREATE INDEX IF NOT EXISTS account_identities_account ON public.account_identities (account_id);

CREATE TABLE IF NOT EXISTS public.account_security_events (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS account_security_events_account_time
    ON public.account_security_events (account_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.account_session_metadata (
    sid TEXT PRIMARY KEY REFERENCES public.dashboard_sessions(sid) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(64),
    device_label VARCHAR(160)
);
CREATE INDEX IF NOT EXISTS account_session_metadata_account
    ON public.account_session_metadata (account_id, last_seen_at DESC);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_email_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_session_metadata ENABLE ROW LEVEL SECURITY;
