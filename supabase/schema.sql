-- EB Bot Supabase schema
-- The application creates these objects automatically; this file is provided
-- for operators who prefer to initialise and inspect the schema in SQL Editor.

CREATE TABLE IF NOT EXISTS public.bot_kv (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
