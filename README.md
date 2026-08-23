# EB Bot V2

Production-oriented Discord bot and bilingual control panel built with Discord.js,
Express, React, Socket.IO/SSE, and Supabase PostgreSQL.

**Product:** V2 · **Package:** 3.1.0 · **Node:** 22.12 LTS · **Commands:** 100 · **License:** MIT

## Highlights

- Moderation, AutoMod, anti-raid, warnings, notes, and role hierarchy
- Music player, queue, filters, lyrics, and autoplay
- XP, levels, rewards, points, leaderboards, and engagement commands
- Tickets, verification, reaction roles, giveaways, polls, suggestions, and confessions
- English/Arabic Dashboard shell with persistent LTR/RTL switching
- Discord OAuth with persistent PostgreSQL sessions
- Guild-isolated HTTP, Socket.IO, and SSE access
- Separate role-scoped Developer Control Center
- Backend-enforced maintenance mode and structured developer audit log
- V2 readiness, performance, and deployment diagnostics
- Automatic dashboard build and graceful Render shutdown

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Discord setup](#discord-developer-portal)
- [Security model](#security-model)
- [Dashboard](#dashboard)
- [Developer Control Center](#developer-control-center)
- [API and readiness](#api-and-readiness)
- [Bot configuration](#bot-configuration)
- [Database](#database)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

## Quick start

Node 22.12 is pinned in `package.json` and `.node-version`.

```bash
git clone https://github.com/EhabYT/Discord-v1.git
cd Discord-v1
cp .env.example .env
# Fill Discord credentials and the Supabase Session Pooler DATABASE_URL.
npm ci
npm start
```

`npm ci` runs `postinstall`, installs the Dashboard dependencies, and builds
`dashboard/public` automatically.

For frontend hot reload:

```bash
npm --prefix dashboard run dev -- --host 0.0.0.0
```

The Vite server listens on `5173` and proxies `/api` and `/socket.io` to the
backend on `3000`.

Generate independent secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not reuse the Discord bot token as `DEV_TOKEN` or `SESSION_SECRET`.

## Configuration

Never commit `.env`. In Render, configure values in the Environment panel.

### Required runtime values

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | Rotated Discord bot token |
| `CLIENT_ID` | Discord Application ID |
| `DATABASE_URL` | Full Supabase PostgreSQL Session Pooler URI |

### Required for OAuth

| Variable | Purpose |
|---|---|
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret |
| `DISCORD_REDIRECT_URI` | Exact registered callback URI |
| `DASHBOARD_URL` | Public Dashboard origin |

### Strongly recommended

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Independent session-signing secret |
| `OWNER_ID` | Discord user ID with guild Admin and system `SUPER_ADMIN` |
| `DEV_TOKEN` | Independent 32+ character developer second factor |
| `NODE_ENV=production` | Production cookie and safety behavior |
| `DASHBOARD_AUTH=true` | Enforce Discord OAuth |
| `DASHBOARD_SECURE=true` | Force secure cookies |

### System-role configuration

| Variable | Purpose |
|---|---|
| `DEVELOPER_IDS` | Comma-separated Discord IDs with `DEVELOPER` base role |
| `SUPPORT_IDS` | Comma-separated Discord IDs with read-only `SUPPORT` role |

### Database and service tuning

| Variable | Default | Purpose |
|---|---:|---|
| `DATABASE_POOL_SIZE` | `5` | PostgreSQL connection-pool limit |
| `DATABASE_SSL` | `true` on hosted URLs | Enable PostgreSQL TLS |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` | Require a trusted custom CA when set to `true` |
| `PORT` | platform assigned | Primary HTTP port |
| `DASHBOARD_PORT` | `3000` | Local fallback HTTP port |
| `DASHBOARD_ORIGIN` | — | Additional trusted browser origin |
| `GUILD_ID` | — | Instant guild command deployment target |
| `DEPLOY_COMMANDS` | `false` | Explicitly deploy commands during startup |
| `SYNC_GLOBAL_COMMANDS` | `false` | Synchronize global commands |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `SUPPORT_INVITE` | — | Support invite shown by the bot |

### Local `.env` editor

A local editor is available at:

```text
http://localhost:3000/setup
```

It writes only allow-listed keys, validates Discord IDs and PostgreSQL URLs,
uses an atomic `0600` file, and requires a direct loopback request. It returns
`404` in production and through every proxy/tunnel. Deployed secrets must be
managed through Render.

## Discord Developer Portal

1. **Bot → Privileged Gateway Intents**: enable Server Members, Message Content,
   and Presence.
2. **OAuth2 → Redirects**: register `DISCORD_REDIRECT_URI` byte-for-byte.
3. Invite scopes: `bot` and `applications.commands`.
4. Grant only permissions required by enabled features.
5. Place the bot role above every role it must assign or moderate.
6. Rotate every token or client secret that has appeared in logs, Git, or chat.

## Security model

### Guild operations

```text
Session authentication
→ Discord identity
→ Guild validation
→ Guild membership
→ Dashboard permission level
→ Discord role hierarchy
→ Action
```

Dashboard levels:

| Level | Name | Access |
|---:|---|---|
| 0 | Viewer | Read-only overview, statistics, and member data |
| 1 | DJ | Viewer plus music controls |
| 2 | Moderator | DJ plus moderation and community operations |
| 3 | Admin | Full guild configuration, permissions, backup, and restore |

The browser permission check is only a UX layer. Every sensitive action is
verified again by backend middleware.

### System operations

```text
Session authentication
→ Discord identity
→ System base role
→ Developer second factor when required
→ Endpoint minimum role
→ Action
→ Audit event
```

```text
SUPER_ADMIN > DEVELOPER > SUPPORT > NONE
```

- Application owner and `OWNER_ID`: `SUPER_ADMIN`
- `DEVELOPER_IDS`: requires independent `DEV_TOKEN` unlock
- `SUPPORT_IDS`: read-only operational access
- Guild Administrator: no automatic system role
- Local direct-loopback development may bootstrap with `DEV_TOKEN`
- Remote production token-only/header-token authorization is not accepted

### Platform defenses

- CSRF origin/referer validation on unsafe requests
- Single-use constant-time OAuth `state`
- Session regeneration after login
- Persistent PostgreSQL session store
- Request body limit of 100 kB
- Global and endpoint-specific rate limits
- Guild-scoped Socket.IO rooms and SSE streams
- Discord hierarchy checks for targeted actions
- Sanitized client errors with correlated request IDs
- Recursive log and audit secret redaction
- Content Security Policy, HSTS, frame, referrer, and permissions headers
- Graceful cleanup of Discord, HTTP, Socket.IO, SSE, scheduler, PostgreSQL, and logs

Public allow-listed endpoints such as health, OAuth entry/status, and V2
readiness are intentionally reachable without a session and return no secrets.
All other `/api/*` routes fail closed.

## Dashboard

React 19 + Vite, served from the same origin as the Express API.

### Normal Dashboard

- Overview
- Analytics, leaderboard, and live activity
- Members and moderation
- Music
- Giveaways and progression
- Tickets and reaction roles
- Birthdays, suggestions, polls, tags, and confessions
- Staff board
- Welcome and verification
- Logs and security
- Commands and server settings
- Bot controls and dashboard permissions
- Owner-only embed builder and auto-responder

The V2 shell, Homepage, System Status, OAuth feedback, and navigation support
English and Arabic with RTL/LTR switching. Detailed feature pages retain English
fallback text where translation is not yet complete.

### Build

```bash
npm run build:dashboard
```

Output:

```text
dashboard/public/
```

Pages are lazy-loaded into independent chunks. Do not edit hashed assets by hand.

## Developer Control Center

Canonical API namespace:

```text
/api/developer/*
```

Legacy `/api/dev/*` requests receive a method-preserving `308` redirect.

### Role matrix

| Feature | SUPPORT | DEVELOPER | SUPER_ADMIN |
|---|:---:|:---:|:---:|
| System overview and backend readiness | ✓ | ✓ | ✓ |
| Command metadata | ✓ | ✓ | ✓ |
| Safe Bot Config metadata | ✓ | ✓ | ✓ |
| Guild operational summary | ✓ | ✓ | ✓ |
| Read feature flags | ✓ | ✓ | ✓ |
| Logs | — | ✓ | ✓ |
| Environment configured status | — | ✓ | ✓ |
| Database diagnostics | — | ✓ | ✓ |
| Performance metrics | — | ✓ | ✓ |
| Scheduler job status | — | ✓ | ✓ |
| Run/pause/resume scheduler jobs | — | — | ✓ |
| Developer audit log | — | ✓ | ✓ |
| Change maintenance/features | — | — | ✓ |
| Deploy slash commands | — | — | ✓ |

The Developer page and Command Palette entries are hidden from ordinary users,
but backend authorization remains authoritative if a URL is entered manually.

### Developer audit

Sensitive developer actions are appended to:

```text
logs/developer-audit.log
```

Events include timestamp, request ID, user ID, system role, action, target,
result, IP metadata, and redacted metadata. Tokens, passwords, authorization
headers, database URLs, and API keys are removed.

### Performance metrics

The backend records bounded process-local metrics:

- Request totals and requests/second
- `401`, `403`, `429`, and `5xx` counters
- Average, maximum, P50, and P95 latency
- Normalized top API paths
- RSS, heap, and external memory
- Event-loop mean, maximum, and P95 delay

Request bodies, query strings, user IDs, and guild IDs are not stored. Discord
snowflakes and UUIDs are normalized before aggregation.

## API and readiness

### Liveness

```text
GET /api/health
```

Returns HTTP 200 while the web process is alive. It is deliberately minimal for
unauthenticated callers.

### V2 status

```text
GET /api/v2/status
```

Always returns HTTP 200 with `ready` or `degraded` checks and capabilities.

### Strict readiness

```text
GET /api/v2/ready
```

Returns HTTP 200 only when Dashboard, PostgreSQL, Discord configuration, and bot
connection are all ready; otherwise HTTP 503.

### Developer APIs

```text
GET  /api/developer/whoami
POST /api/developer/unlock
POST /api/developer/lock
GET  /api/developer/overview
GET  /api/developer/system-status
GET  /api/developer/commands
GET  /api/developer/config
GET  /api/developer/guilds
GET  /api/developer/flags
GET  /api/developer/logs
GET  /api/developer/env
GET  /api/developer/db
GET  /api/developer/metrics
GET  /api/developer/jobs
GET  /api/developer/audit
POST /api/developer/jobs/:name/run
POST /api/developer/jobs/:name/pause
POST /api/developer/jobs/:name/resume
POST /api/developer/flags
POST /api/developer/deploy-commands
```

Every endpoint applies its own minimum backend system role.

## Bot configuration

`config/bot.json` is secret-free and uses schema version 2:

```text
identity
colors
emojis
limits
automod
```

Contract documentation:

```text
config/bot.schema.json
```

Runtime loader:

```text
shared/config/bot-config.js
```

Startup rejects unsupported keys, malformed colors, invalid limits, duplicate
terms, and invalid identity metadata. The resulting object is deeply immutable.
All bot modules consume this validated loader rather than importing raw JSON.

AutoMod profanity checks use Unicode and optional leetspeak normalization plus
whole-word matching. This avoids substring false positives such as a short term
matching inside `class`, `assignment`, or `assistant`.

## Database

Supabase PostgreSQL stores all persistent bot and OAuth data.

Tables created automatically:

```text
bot_kv
dashboard_sessions
```

RLS is enabled without browser policies. Prefix-heavy features use indexed,
keyset-paginated PostgreSQL scans instead of loading the full key/value table.
Developer key counts use SQL aggregates without transferring JSONB values.

Use the Supabase **Session Pooler** URI for Render IPv4 compatibility:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@HOST.pooler.supabase.com:5432/postgres
```

Do not use the HTTPS Supabase project URL as `DATABASE_URL`.

### Legacy SQLite migration

```bash
npm run migrate:sqlite -- --source database/json.sqlite --dry-run
DATABASE_URL='postgresql://...' npm run migrate:sqlite -- --source database/json.sqlite
```

The source is opened read-only. Import runs inside a PostgreSQL transaction and
is safe to repeat.

## Maintenance mode

Maintenance is enforced by the backend, not by hidden buttons.

Normal APIs receive:

```json
{
  "error": "Maintenance message",
  "code": "MAINTENANCE",
  "until": 1787000000000
}
```

with HTTP 503 and optional `Retry-After`. Health, OAuth, V2 diagnostics, and
role-authorized Developer APIs remain available. Discord commands apply the
same policy. `SUPER_ADMIN` can configure a message and automatic end time.

## Commands

The loader validates exactly 100 slash commands.

| Category | Examples |
|---|---|
| Moderation | `ban`, `softban`, `kick`, `timeout`, `warn`, `note`, `lockdown` |
| AutoMod | `automod`, `whitelist`, `lock`, `unlock`, `slowmode` |
| Utility | `help`, `userinfo`, `define`, `math`, `afk`, `remind`, `tools` |
| Music | `play`, `queue`, `skip`, `volume`, `filters`, `autoplay`, `lyrics` |
| Games | `fun`, `games`, `slots`, `coinflip`, `truthordare` |
| Tickets | `ticket` subcommands for setup, claim, transcript, and close |
| Verification | `setupverification` |
| Roles | `reactionrole` |
| Birthdays | `birthday`, `birthdaysettings` |
| Logging | `logging` |
| Engagement | `rank`, `leaderboard`, `daily`, `work`, `pay`, `points`, `rep` |
| Community | `suggest`, `poll`, `confess`, `giveaway`, `serverstats` |

Privileged commands declare Discord default permissions and re-check permissions
at execution time. Command exceptions return a short Error ID while full details
remain in redacted backend logs.

## Testing

```bash
npm test
npm run test:unit
npm run test:security
npm run lint
npm run lint:gate
npm run audit:prod
npm run build:dashboard
npm run verify
npm run smoke:live -- --url https://your-service.onrender.com --expect-release 2.0.0
```

Current verification scope:

- 100 Discord commands
- Bot Config schema and AutoMod normalization
- 22 security suites
- 159 API routes
- OAuth, sessions, CSRF, and guild isolation
- Discord hierarchy and privacy redaction
- Abuse and rate limits
- Economy/giveaway concurrency
- Error containment and graceful shutdown
- PostgreSQL, migration, and session adapters
- Socket.IO/SSE guild isolation
- Developer role and direct API enforcement
- Audit metadata and recursive secret redaction
- Performance metrics
- Backend maintenance enforcement
- V2 readiness contract
- Dashboard production build
- Root and Dashboard production audits

Latest complete report:

```text
docs/v2-test-report.md
```

Architecture/security report:

```text
docs/v2-architecture-audit.md
```

Tests intentionally generate synthetic backend errors to verify sanitization.
Warnings about missing credentials are expected in credential-free CI.

## Deployment

### Render

`render.yaml` defines:

```text
Build:  npm ci
Start:  npm start
Health: /api/health
Node:   22.12.0
```

The HTTP service starts before Discord diagnostics so Render always receives a
listening port. Bot bootstrap retries with bounded exponential backoff while
Supabase is unavailable. Invalid Discord credentials do not trigger request
loops.

For an always-connected Discord gateway, use an always-on Render plan. Free
instances can sleep even when the gateway connection is healthy.

Run the credential-free deployment acceptance after each release:

```bash
# Contract/security preflight; permits offline integrations.
npm run smoke:live -- --url https://your-service.onrender.com --allow-degraded --expect-release 2.0.0

# Final acceptance; requires PostgreSQL, Discord, OAuth, Dashboard, and bot ready.
npm run smoke:live -- --url https://your-service.onrender.com --expect-release 2.0.0
```

The full operator checklist and rollback procedure are in
`docs/deployment-live-runbook.md`.

### Graceful shutdown

`SIGTERM` and `SIGINT` stop:

1. Bootstrap retry timer
2. Scheduler jobs
3. Discord client
4. SSE clients
5. Socket.IO
6. HTTP server
7. PostgreSQL pool
8. Logger streams

## Architecture

```text
Browser
  └─ React Dashboard V2
       ├─ Normal guild dashboard
       └─ Role-scoped Developer Control Center
            └─ Backend-only System Status UI
            │
            ▼
Express Backend
  ├─ OAuth/session authentication
  ├─ CSRF, rate limits, CSP, maintenance
  ├─ Guild membership/permissions/hierarchy
  ├─ System-role authorization
  ├─ Developer audit and metrics
  ├─ Socket.IO and SSE isolation
  └─ Sanitized errors/request IDs
            │
      ┌─────┴─────────┐
      ▼               ▼
Supabase          Discord
PostgreSQL        Gateway/REST/Voice
```

Key directories:

```text
bot/src/                    Discord commands, gateway events, scheduler
backend/src/routes/         HTTP APIs
backend/src/middleware/     Authentication, authorization, CSRF, maintenance
backend/src/websocket/      Authenticated Socket.IO
backend/src/utils/          SSE
backend/src/metrics.js      Process-local operational metrics
dashboard/src/              React V2 client
shared/config/              Validated Bot Config loader
shared/services/            Shared domain services and developer audit
database/                   PostgreSQL adapter and per-key locks
scripts/                    Migration and tunnel tooling
tests/                      Unit, security, and manual tests
config/                     Secret-free bot configuration and JSON schema
docs/                       Audits, lessons, and test reports
```

## Troubleshooting

### `DATABASE_URL must start with postgresql://`

Use the Supabase Session Pooler URI, not the HTTPS project URL. Paste it as a raw
Render value without Markdown or placeholders.

### `Database is temporarily unavailable`

Verify hostname, port `5432`, encoded password, pooler username, SSL settings,
and Supabase project status.

### Bot is offline

Check `/api/v2/status`. The `botBootstrap` object reports state, attempt count,
last error, and next retry time. Confirm PostgreSQL is ready before Discord login.

### OAuth is disabled

Check `/api/auth/status` for an actionable error. Ensure `CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DATABASE_URL`, Dashboard URL, and redirect URI are
correct. The redirect must match Discord Developer Portal exactly.

### Dashboard build missing

Run:

```bash
npm --prefix dashboard ci
npm run build:dashboard
```

The root `postinstall` performs this automatically during normal deployment.

### `401 AUTH_REQUIRED`

Sign in through Discord OAuth. `DASHBOARD_AUTH=false` is only permitted from a
direct loopback connection in development.

### `403 SYSTEM_ROLE_REQUIRED`

Guild Administrator is not a Developer role. Configure `OWNER_ID`,
`DEVELOPER_IDS`, or `SUPPORT_IDS` and sign in with that Discord account.

### `403 CSRF_ORIGIN`

Set `DASHBOARD_URL` to the exact browser origin or configure an additional
`DASHBOARD_ORIGIN`.

### `429 RATE_LIMITED`

Wait for the `Retry-After` duration. Expensive operations use stricter per-user
buckets.

### Hierarchy failures

Move the bot role above the target role/member. Discord hierarchy is enforced
for Dashboard and slash-command actions.

### Sessions reset after restart

Set an independent `SESSION_SECRET`. A stable key is derived from
`DATABASE_URL` only as a safe fallback; an explicit secret is preferred.

## Documentation

- [V2 architecture and security audit](docs/v2-architecture-audit.md)
- [Phase 1 optimization audit and manifest](docs/phase1-optimization-audit.md)
- [Phase 2 indexed prefix-query optimization](docs/phase2-prefix-query-optimization.md)
- [Complete V2 test report](docs/v2-test-report.md)
- [Engineering lessons](docs/engineering-lessons.md)
- [Supabase schema](supabase/schema.sql)

## License

MIT
