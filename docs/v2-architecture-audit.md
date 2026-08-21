# EB Bot V2 — Architecture, Security, and Dashboard Separation Audit

Date: 2026-08-21  
Scope: 352 tracked files, 29 dashboard pages, 11 shared components, 100 bot commands, 22 gateway/player event modules, and 149 explicit router endpoint declarations.

## Executive summary

The application is a single Node.js deployment containing three runtime layers:

1. React/Vite browser client in `dashboard/`.
2. Express, Socket.IO, and SSE backend in `backend/`.
3. Discord gateway client, music player, commands, and schedulers in `bot/` and `shared/`.

Supabase PostgreSQL is the persistent store through a JSONB compatibility adapter. The browser has no direct database or privileged Discord credentials. Existing `/api/*` contracts remain supported; V2 adds `/api/v2/*` diagnostics and adopts `/api/developer/*` as the canonical infrastructure namespace.

The largest issue found during this separation audit was not file placement but authorization composition: developer functionality had one broad role, the Developer navigation entry was visible to ordinary users, secret environment values exposed a four-character suffix, and live SSE filtering had previously depended on the browser. These are now enforced server-side.

## Current architecture

```text
Browser
  └─ React Dashboard V2
       ├─ normal guild-management pages
       ├─ system readiness page (public, secret-free)
       └─ developer control center (system-role discovery)
            │
            ▼
Express API
  ├─ session authentication + OAuth state
  ├─ CSRF, rate limits, body limits, security headers
  ├─ guild membership + dashboard permission + hierarchy
  ├─ system-role authorization for /api/developer/*
  ├─ Socket.IO guild rooms
  └─ guild-scoped SSE streams
            │
      ┌─────┴─────────┐
      ▼               ▼
Supabase          Discord
PostgreSQL        Gateway/REST/Voice
```

## Frontend classification

### Normal dashboard

The following remain visible to authenticated guild users subject to guild role level:

- Overview and system readiness
- Analytics, leaderboard, and live feed
- Members and moderation tools
- Music
- Giveaways and progression
- Tickets and reaction roles
- Birthdays, suggestions, polls, tags, and confessions
- Staff board
- Welcome and verification
- Logs and security configuration
- Commands and server settings
- Bot controls and dashboard role permissions
- Owner-gated embed builder and auto-responder

Frontend permission filtering is only a usability layer. All underlying guild routes apply authentication, guild resolution, membership, dashboard level, and Discord hierarchy on the backend.

### Developer control center

The Developer navigation item is now shown only when `/api/developer/whoami` reports a configured system identity or a local bootstrap capability. Manually entering the URL does not bypass backend authorization.

Actual supported developer sections:

- System/process overview
- Bot status, ping, guild count, and command registry
- Approved application and tunnel logs
- Secret-free environment configuration status
- PostgreSQL key-prefix diagnostics
- Guild operational summary
- Feature flags and maintenance mode
- Explicit command deployment
- Persistent developer action audit log
- Request, error-rate, latency, event-loop, and process-memory metrics

No fake cache, Redis, Lavalink, shard, queue, arbitrary SQL, shell, rollback, or migration-control page was created because those capabilities do not exist in this runtime.

## Backend classification

### Browser-safe APIs

- OAuth entry/status/callback
- Minimal health and V2 readiness metadata
- Authenticated guild-management APIs
- Authenticated, guild-scoped real-time channels

### Developer APIs

Canonical prefix:

```text
/api/developer/*
```

Backward-compatible alias:

```text
/api/dev/*
```

Role policy:

| Endpoint group | Minimum system role |
|---|---|
| `whoami`, `unlock`, `lock` | discovery/controlled elevation |
| overview, commands, guilds, flags read | SUPPORT |
| logs, environment, database, audit | DEVELOPER |
| feature-flag writes, command deployment | SUPER_ADMIN |

### Backend-only implementation

The following never enter the browser bundle:

- Discord bot token and OAuth client secret
- PostgreSQL connection URI/password
- Session and developer signing secrets
- Database pool
- Discord gateway client
- Scheduler callbacks
- Raw filesystem paths
- Process control and log file reads
- Hierarchy enforcement
- Developer audit writer

## System role model

```text
SUPER_ADMIN > DEVELOPER > SUPPORT > NONE
```

- `OWNER_ID` and Discord application owner receive `SUPER_ADMIN`.
- `DEVELOPER_IDS` is a comma-separated allowlist. Listed developers must unlock with an independent 32+ character `DEV_TOKEN` second factor.
- `SUPPORT_IDS` receives read-only operational access.
- Ordinary Discord users receive `NONE` regardless of guild Administrator permission.
- A direct localhost development session may bootstrap with `DEV_TOKEN`.
- Token-only remote production access and `x-dev-token` authorization are not accepted.

Guild roles and system roles are separate domains. A guild Administrator is not automatically a system developer.

## Authentication and authorization chain

Guild action:

```text
Session → Discord identity → guild exists → guild membership
→ dashboard level → Discord hierarchy → action
```

Developer action:

```text
Session → Discord identity → base system role
→ optional second factor → endpoint minimum role → action → audit event
```

## Secrets and environment handling

- `.env` is gitignored and written only by a direct-localhost development page.
- `/setup` returns 404 in production and through any proxy/tunnel.
- Developer environment responses return `set: true/false`; secret previews are empty.
- Logger metadata is recursively redacted for token, secret, password, authorization, database URL, and API-key fields.
- Audit metadata applies a separate allowlist/redaction layer.
- No arbitrary environment key can be written by the local setup page.

## Developer audit log

Sensitive system actions append structured JSONL events to:

```text
logs/developer-audit.log
```

Fields:

- timestamp
- request ID
- developer user ID
- effective system role
- action
- target
- result
- request IP metadata
- redacted metadata

Currently audited actions include developer unlock/lock, authorization denials for signed-in users, log inspection, environment inspection, database inspection, feature updates, and command deployment.

## Database

- Provider: Supabase PostgreSQL through `pg`.
- `bot_kv` preserves the prior key/value API with JSONB values.
- `dashboard_sessions` persists OAuth sessions.
- RLS is enabled with no browser policies.
- Pool size is bounded.
- Connection/bootstrap failures retry rather than poisoning the process permanently.
- A read-only SQLite export plus transactional migration utility is available for legacy data.
- Arbitrary SQL execution is not exposed.

## Realtime systems

### Socket.IO

- Shares the Express session.
- Rejects unauthenticated connections.
- Validates guild IDs and membership before room joins.

### SSE

- Requires authentication and a guild ID.
- Resolves guild membership server-side.
- Stores an authorized guild scope per response.
- Never broadcasts one guild's events to another guild's client.
- All streams close during graceful shutdown.

## Logging and errors

- Log injection controls remove CR/LF and control characters.
- Nested secret-bearing metadata is recursively redacted.
- API failures receive a request ID in response and logs.
- Internal stack traces and filesystem paths are not returned.
- PostgreSQL operational failures become actionable, sanitized 503 responses.
- Developer audit and ordinary application logs are separate.

## Performance monitoring

The backend collects bounded, process-local operational metrics without storing
request bodies, query strings, guild IDs, or user IDs. Discord snowflakes and
UUIDs are normalized before endpoint aggregation. Developer-only metrics include:

- request totals and requests/second
- 401, 403, 429, and 5xx counters
- average, maximum, p50, and p95 response latency
- top normalized API paths
- RSS, heap, and external memory
- event-loop mean, max, and p95 delay

The in-memory samples are capped and reset on process restart. A shared metrics
backend is still recommended before running multiple application instances.

## Deployment and lifecycle

- Node 22.12 is pinned.
- Dashboard builds automatically during installation.
- HTTP starts before Discord diagnostics so Render always gets a listening port.
- Bot bootstrap retries with bounded exponential backoff.
- Duplicate dashboard starts are ignored.
- SIGTERM/SIGINT perform scheduler, Discord, Socket.IO, SSE, HTTP, PostgreSQL, and logger cleanup.
- `/api/health` is a liveness endpoint.
- `/api/v2/ready` is strict full-service readiness.

## Changes performed in this audit phase

- Added hierarchical backend system roles.
- Added canonical `/api/developer/*` namespace while preserving `/api/dev/*`.
- Removed remote header-token authorization.
- Made DEV_TOKEN an independent second factor for listed developers.
- Hid developer navigation and search entries from ordinary users.
- Added endpoint-specific least privilege.
- Removed secret suffix previews.
- Removed unnecessary cwd and owner-ID disclosure from overview responses.
- Added request IDs before route execution.
- Added structured developer audit logging and audit UI.
- Added recursive logger redaction.
- Added developer/support environment configuration.

## Tests

Automated suites cover:

- fail-closed authentication
- OAuth CSRF state and session fixation
- guild isolation
- Discord role hierarchy
- CSRF origin checks
- abuse/rate limiting
- atomic economy and giveaway writes
- event error boundaries
- sanitized error handling
- complete API audit sweep
- dependency security backport
- PostgreSQL and session adapters
- migration safety
- SSE guild isolation
- local environment editor
- V2 readiness contract
- system roles, secret redaction, and audit metadata
- graceful lifecycle cleanup and security headers

## Remaining risks and recommendations

1. Render Free instances can sleep; an always-connected Discord gateway should use an always-on plan.
2. In-process guild locks assume `WEB_CONCURRENCY=1`. Multi-instance deployment needs PostgreSQL advisory locks or transactional row-level operations.
3. Log and developer-audit files are ephemeral on Render unless shipped to external storage.
4. Current analytics are process-local. Multi-instance metrics need a shared metrics backend.
5. Feature pages are incrementally localized; the V2 shell, navigation, status, and homepage are bilingual, while some detailed feature forms retain English fallback text.
6. Token and database credentials posted in conversation history must be rotated before production use.

## Final separation

The browser now provides presentation and user input only. Guild and system authorization, resource ownership, role hierarchy, secret handling, database access, Discord actions, process diagnostics, and developer audit enforcement remain in the backend.
