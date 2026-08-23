# Phase 1 Optimization Audit — EB Bot V2

Date: 2026-08-21  
Directive phase: **Audit and manifest only — no production source deletion or architectural refactor executed**

## 1. Executive result

The repository is a JavaScript/React monorepo, not a native multi-language
system. No project-owned C, C++, Rust, kernel, SIMD, manual-memory, or header
source exists. Native code is limited to third-party packages and prebuilt
bindings. Bare-metal pointer, RAII, structure-padding, and compiler-vectorization
work is therefore out of scope for this codebase.

The audit found:

- 365 tracked files.
- 220 production JavaScript/JSX source modules in the analyzed runtime graph.
- 220/220 source modules reachable or intentionally convention-loaded.
- Zero confirmed orphan production modules.
- Zero unused direct dependencies confirmed.
- Zero ESLint errors/warnings in the current baseline.
- Zero production dependency vulnerabilities in root and Dashboard audits.
- The main optimization opportunities are PostgreSQL full-table scans, a large
  monolithic guild router, synchronous developer/audit filesystem operations,
  and generated frontend artifact policy—not low-level CPU instruction tuning.

## 2. Detected languages and frameworks

### First-party runtime

| Layer | Technology |
|---|---|
| Bot | Node.js 22.12, Discord.js 14, discord-player 7 |
| Backend | CommonJS, Express 5, express-session, Socket.IO, SSE |
| Frontend | React 19, Vite 8.2, Tailwind 3, JSX/ES modules |
| Database | Supabase PostgreSQL through `pg`, JSONB compatibility adapter |
| Scripts | Bash, Node.js, one Python SQLite reader, SQL schema |
| Configuration | JSON/JSON Schema, YAML, environment variables |

### File inventory

| Extension/type | Count |
|---|---:|
| `.js` | 280 |
| `.jsx` | 43 |
| `.md` | 12 |
| `.json` | 8 |
| `.ts` | 3 |
| Images/fonts/SVG | 6 |
| HTML/CSS | 4 |
| YAML/SQL/Bash/Python | 4 |
| Miscellaneous config/metadata | 5 |

The `.ts` files are declarations in the vendored dependency, not application
TypeScript source.

## 3. Repository map

```text
bot/                  Discord entrypoint, 100 commands, gateway/player events,
                      observable scheduler
backend/              Express server, middleware, routes, sessions, realtime,
                      metrics
shared/               Domain services, validated config, logging, audit, embeds
                      and interaction helpers
database/             PostgreSQL adapter and process-local key locks
dashboard/src/        React V2 shell, 29 pages, 11 shared components
dashboard/static/     Source assets copied by Vite
dashboard/public/     Generated production assets (68 files, ~1.3 MB)
config/               Secret-free Bot Config V2 and JSON Schema
scripts/              Lint gate, Cloudflare watchdog, legacy DB migration
supabase/             Idempotent schema
vendor/file-type/     Reviewed compatibility/security backport
tests/                Unit, security, integration-like, and manual tests
docs/                 Historical audits, engineering notes, V2 reports
```

Tracked-file distribution is dominated by Dashboard source/build output and the
100 individually loaded command modules.

## 4. Reachability and dead-code analysis

A static relative import/require/dynamic-import graph was built over:

```text
bot/
backend/
shared/
database/
dashboard/src/
```

Entrypoints:

```text
bot/src/index.js
backend/src/server.js
dashboard/src/main.jsx
```

The audit also treats filesystem/convention-loaded modules as roots:

- every `bot/src/commands/*.js` file
- every Discord/player event module
- every Dashboard page loaded through the page registry
- test and script entrypoints

Result:

```text
Production source modules analyzed:     220
Reachable/convention-rooted modules:     220
Confirmed orphan modules:                 0
```

The many zero-static-inbound command/event files are not dead code; they are
discovered by directory loaders. Deleting them based only on static inbound
references would remove live slash commands and event handlers.

ESLint's zero-warning baseline also found no unreferenced local variables,
functions, or imports in parsed source.

## 5. Dependency audit

### Root dependencies

All direct dependencies are referenced directly or intentionally satisfy runtime
peer/dynamic loading:

- `@discord-player/extractor`, `discord-player`: extractors/player
- `@discord-player/opus`: runtime audio codec
- `ffmpeg-static`: runtime FFmpeg provider
- `mediaplex`: dynamically required attachment/media probe
- local `file-type`: Discord Player-compatible security backport
- `@napi-rs/canvas`: rank/welcome rendering
- `discord.js`: gateway, REST, builders, permissions
- `axios`: external HTTPS tools/services and OAuth token exchange
- `express`, `compression`, `express-session`, `socket.io`: backend
- `pg`: PostgreSQL/session storage
- `genius-lyrics`: lyrics lookup
- `dotenv`: environment loading

### Dashboard dependencies

All direct Dashboard dependencies are used:

- React/ReactDOM
- Socket.IO client
- Lucide icons
- `clsx`
- Vite/React plugin
- Tailwind/PostCSS/Autoprefixer

### Outdated but intentionally not auto-upgraded

- Lucide and Tailwind report major-version upgrades requiring separate UI/build
  migrations.
- ESLint reports a major upgrade requiring a flat-config compatibility review.

Compatible patches already applied:

```text
@napi-rs/canvas 1.0.7
vite 8.2.2
@vitejs/plugin-react 6.1.0
```

No dependency deletion is approved in Phase 1.

## 6. Duplicate and generated assets

No identical tracked content duplicates were found outside generated
`dashboard/public` output.

The apparent source/build duplication is intentional:

```text
dashboard/static/*  → source assets
dashboard/public/*  → Vite deployment output
```

The output currently contains 68 files and is approximately 1.3 MB. The main
bundle is approximately 260 kB uncompressed and 82 kB gzip; feature pages remain
lazy chunks.

Generated asset hashes create high Git churn. Removing them from Git is possible
because `postinstall` builds the Dashboard, but it changes offline/source-archive
behavior and must be an explicit policy decision in a later phase.

## 7. Blocking I/O classification

### Startup-only and acceptable

- command/event directory enumeration
- Bot Config JSON loading
- startup command serialization

These occur before request/event hot paths.

### Developer-only and bounded

- log-tail reads
- file metadata reads
- fixed `ps` command with a three-second timeout

These are role-protected operational endpoints, not normal user traffic.

### Optimization candidates

- synchronous developer-audit append/read
- public tunnel URL file reads/writes
- logger rotation `statSync`

They are low-frequency today, but async queued writes or PostgreSQL persistence
would improve tail latency and Render durability.

## 8. Database and algorithmic hot paths

### Highest-priority issue: `db.all()`

Multiple commands, guild routes, scheduler jobs, staff-board services, and
Developer diagnostics load the full `bot_kv` table and filter keys in memory.
This scales as O(total keys), even when only one prefix is needed.

Examples include:

- birthdays
- rankings/leaderboards
- warning/note summaries
- tickets and reminders
- staff-board scans
- scheduled birthday/reminder cleanup
- Developer key-prefix diagnostics

Recommended Phase 2/4 change:

```text
db.scanPrefix(prefix, { limit, cursor })
```

implemented as an indexed PostgreSQL prefix/range query, then migrate each call
incrementally. This is likely the largest measurable database improvement.

### Sequential Discord operations

Sequential awaits exist in lockdowns, channel creation, reactions, role removal,
giveaway eligibility, invite caching, command deployment, and scheduled guild
work. Most are intentionally serial to respect Discord rate limits. Blind
`Promise.all` conversion would increase global rate-limit pressure and is not
approved.

Safe bounded-concurrency opportunities should use a small limiter (for example
2–5 concurrent operations), endpoint-specific budgets, and partial-failure
reporting.

### Small bounded quadratic operations

The identified nested/filter-find patterns run on tiny bounded collections
(navigation pages, 3×3 Minesweeper neighbors, role option lists). Replacing them
would not materially improve runtime performance.

## 9. Memory and lifecycle audit

Existing protections:

- rate-limit bucket sweeper
- SSE guild-throttle cleanup
- bounded metrics path/sample storage
- capped notes/warnings/lists
- scheduler overlap prevention and timer cleanup
- Socket.IO/SSE/PostgreSQL/logger graceful shutdown
- bootstrap retry timer cleanup
- Vite page-level code splitting

No confirmed unbounded production listener leak was found. The process-local
metrics, analytics, rate limits, and locks assume `WEB_CONCURRENCY=1`.
Multi-instance scaling requires shared or database-backed coordination.

## 10. Architectural concentration

`backend/src/routes/guilds.js` is approximately 83 kB and remains the largest
first-party backend module. It combines many domains and increases review,
testing, and merge-conflict cost.

Recommended incremental split while preserving URLs:

```text
routes/guild/moderation.js
routes/guild/members.js
routes/guild/automod.js
routes/guild/community.js
routes/guild/tickets.js
routes/guild/giveaways.js
routes/guild/progression.js
routes/guild/settings.js
```

Every subrouter must reuse `guildAccessStack` and existing hierarchy/rate-limit
middleware. This is an architectural maintainability optimization, not a
latency optimization, and should be executed with route-inventory tests after
each extraction.

## 11. Security/deployment observations relevant to optimization

- Production audits currently report zero vulnerabilities.
- No tracked `.env`, database, runtime log, or credential artifacts exist.
- Public V2 endpoints are secret-free; full System Status is system-role gated.
- Developer actions are role-scoped and audited.
- Render Free sleeping remains incompatible with a permanently connected Discord
  gateway.
- Log and audit files are ephemeral on Render.
- The local `file-type` backport remains technical debt until upstream provides a
  compatible fixed CommonJS release.

## 12. Deletion manifest — proposed, not executed

### Safe runtime cleanup (untracked/generated only)

| Path/pattern | Reason | Risk | Proposed action |
|---|---|---:|---|
| `.dashboard-url` | Temporary active tunnel pointer | Low | Delete when tunnel process is stopped |
| `logs/*.log` | Runtime output | Low | Purge/rotate; retain `.gitkeep` |
| `logs/keep-tunnel.lock` | Runtime PID lock | Low | Delete only when watchdog is not running |
| `logs/dead-hosts.txt` | Runtime tunnel history | Low | Retain while watchdog runs; purge when resetting tunnels |

These files are already ignored and are not repository technical debt.

### Conditional repository cleanup requiring approval

| Candidate | Evidence | Benefit | Risk/requirement |
|---|---|---|---|
| `dashboard/public/assets/*` tracking | Fully generated by Vite/postinstall | Removes hash churn and ~1.3 MB generated output | Every deployment/archive must build before `npm start` |
| Historical audit docs | Superseded operational details | Smaller docs surface | Lose decision history; archive instead of delete |
| `/api/dev/*` compatibility redirect | Canonical clients use `/api/developer/*` | Removes legacy alias | External clients may still rely on old path |
| SQLite migration scripts | One-time migration only | Smaller production package | Keep until every deployment confirms migration complete |
| Local `vendor/file-type` | Compatibility security patch | Remove vendored third-party code | Wait for upstream compatible fixed release |

### Explicitly not deletion candidates

- 100 command files: convention-loaded and verified
- event modules: convention-loaded and verified
- Dashboard pages: lazy-loaded through registry
- source/static and public assets: source/output pair
- `render.yaml`, Supabase schema, tests, and current V2 docs

## 13. Modification manifest — proposed, not executed

Priority order for subsequent phases:

1. **Prefix-query PostgreSQL adapter**
   - Add `scanPrefix`, pagination, and bounded result sizes.
   - Replace full-table scans one domain at a time.
   - Add query-count/latency regression tests.

2. **Split the guild router**
   - Extract one domain at a time without changing public URLs.
   - Preserve shared middleware order.
   - Pin the API inventory after every extraction.

3. **Persist developer audit externally**
   - PostgreSQL append-only table or managed log sink.
   - Retention and pagination.
   - Keep filesystem fallback.

4. **Async operational file I/O**
   - Queue audit writes.
   - Replace synchronous log-tail and public-URL operations where measurable.

5. **Bounded Discord concurrency utility**
   - Apply only to independently safe API calls.
   - Preserve Discord rate-limit behavior.

6. **Generated frontend artifact policy**
   - Decide whether `dashboard/public` remains tracked.
   - Add a CI check that build output exists and is reproducible.

7. **Multi-instance correctness plan**
   - PostgreSQL advisory locks/transactions for economy and giveaway mutations.
   - Shared metrics/rate limits if `WEB_CONCURRENCY` exceeds one.

8. **Major dependency migration tracks**
   - Tailwind 4, Lucide 1, and ESLint 10 only in isolated compatibility branches.

## 14. Baseline verification evidence

Current automated baseline before any optimization refactor:

- 100 slash commands loaded
- Bot Config schema/normalization tests pass
- 20 security suites pass
- 159 HTTP routes audited
- Dashboard production build succeeds
- Root and Dashboard production audits: zero vulnerabilities
- ESLint baseline: zero errors and warnings
- JSON, conflict-marker, symlink, and tracked-secret scans pass

The sandbox runs Node 20.20.2 and prints `EBADENGINE`; production is pinned to
Node 22.12. Optimization benchmarks should be collected on Node 22.12 to avoid
runtime-version noise.

## 15. Phase 1 conclusion

No aggressive deletion is justified. The codebase has no confirmed orphan
runtime module and no confirmed redundant direct dependency. The best next
optimization is not a broad rewrite: it is a measured PostgreSQL prefix-query
API followed by incremental removal of full-table scans. The second priority is
splitting the monolithic guild router while preserving middleware composition
and route contracts.

No production source files were deleted or reorganized during this phase.
Explicit approval is required before Phase 2 modifications begin.
