# Phase 0 — Discovery Report

**Project:** EB Bot v3.1.0
**Discovery date:** 2026-10-25
**Branch:** `arena/e30916a0-discord-v1`
**Scope:** tracked repository files, workspace/package configuration, bot/API/web architecture, CI/deployment configuration, current automated checks, and the supplied project specification.
**Implementation changes:** none. This report replaces an older discovery document whose file paths, stack inventory, counts, and findings no longer match the current checkout.

---

## 1. Executive summary

The repository is a JavaScript monorepo with separate `apps/bot`, `apps/api`, and `apps/web` workspaces, plus shared, database, config, and scripts packages. It has substantial security middleware and a sizeable unit/security test suite. The source lint, test suite, release-configuration check, and web build all passed in this discovery run.

The project is **not compliant with the supplied target specification**. Principal gaps are: JavaScript rather than strict TypeScript, npm rather than pnpm, Express 5 rather than Express 4/Fastify 4, no Redis or Zod, no Docker/Compose or deployment workflow, and missing app-level scripts/typecheck. The web app uses React 19 and Vite; its pages are code-split and it uses HttpOnly cookie sessions rather than browser-stored auth tokens.

**Release blocker:** the production dependency audit finds 5 fixable vulnerabilities (1 critical, 4 high). Since `npm run verify` includes this audit, the authoritative verification gate will fail until these are resolved or an explicit reviewed exception is made.

---

## 2. Repository inventory

- **400 tracked files** on the discovery branch.
- Main code: `apps/api` (Express API), `apps/bot` (discord.js bot), `apps/web` (React/Vite client); shared code under `packages/shared`, `packages/database`, `packages/config`, and `packages/scripts`.
- Tracked source extensions include **271 `.js`** and **55 `.jsx`** files; no TypeScript files or TS configuration were found.
- Tests: **19 unit files** and **24 security files**, plus a manual command runner.
- Bot command-loader test discovers **100 commands** with no load errors.
- API route-discovery security test reports **200 routes**, all gated or explicitly allowlisted.
- Dashboard is built into `apps/web/public` (ignored build output); Vite build transforms 1,964 modules and emits route-level chunks.
- Workspace package manager is npm (`package-lock.json`, npm workspaces). Node is pinned to `22.12.0` in `.node-version`.

### Runtime and package layout

| Area | Current implementation | Specification alignment |
|---|---|---|
| Bot | JavaScript/CommonJS, discord.js 14, one bot client | discord.js major aligns; TypeScript, pino, zod, sharding absent |
| API | Express 5, custom middleware, raw `pg`-backed database package | Express major differs; no Prisma/Drizzle, Redis, or Zod |
| Web | Vite, React 19, JSX, Tailwind 3 | Vite aligns as an option; React version and TypeScript differ |
| Shared/database | `packages/shared`, `packages/database`; custom PostgreSQL schema/adapter | Shared package exists; no required Zod schemas/TS types or Prisma/Drizzle package |
| Task tooling | Turbo 2 config, ESLint 9 flat config, Prettier 3 | Versions align; root scripts do not consistently delegate to Turbo |
| Package manager | npm workspaces and lockfile | Conflicts with pnpm 9 / no npm at root requirement |

---

## 3. Current architecture and behavior

- The bot and API run in the same Node process when started through the bot entrypoint; the API receives the live Discord client and uses its guild/member caches. The API can also be started independently.
- Bot commands are recursively loaded once into a name-keyed collection during process startup. The normal bootstrap has a `servicesLoaded` guard. There is no general reload/unload path; the event loader itself does not detach existing listeners if called repeatedly. Duplicate command names would overwrite the earlier collection entry rather than be explicitly rejected.
- Global `unhandledRejection` and `uncaughtException` process handlers exist. The bot does not register a `client.on('error')` handler.
- `MessageContent` is used by message moderation and auto-response behavior; it is not demonstrably redundant. `GuildPresences` is enabled, but no corresponding feature use was confirmed in this discovery scan and it merits a focused check. No ShardingManager or shard threshold was found.
- Slash commands are sent as one bulk REST `PUT` per configured guild and/or globally, not one request per command. The deploy helper catches and logs failures; no custom retry/backoff policy was confirmed.
- API auth uses server-side sessions and HttpOnly cookies. OAuth has a random, single-use `state` check. PKCE was not found. JWT access/refresh tokens and refresh rotation are not used, so those checklist items do not directly describe the current session model.
- CSRF origin checks, Helmet headers, fail-closed authentication, guild-access checks, request-size limits, global/per-operation rate limits, and Socket.IO origin restrictions are present. Rate-limit buckets are process-local; sessions use PostgreSQL when configured, with a bounded in-memory fallback for local/degraded use.
- API validation uses a custom field-rule middleware plus route-level checks, not Zod schemas. Some endpoints validate explicitly; no central typed schema contract was found.
- Frontend auth requests include credentials and use the server session. `localStorage`/`sessionStorage` references found in source are for UI state, locale, navigation, or user-created templates, not auth-token persistence.
- Guild overview reads use a batched database `mget`; the guild list filters the bot's in-memory cache. No broad N+1 issue was established in these inspected paths. Database schema has useful indexes, but it is not a Prisma/Drizzle relational model for the required guild/user indexing review.
- Vite has lazy-loaded pages and emits separate chunks. In the production build, the largest listed JS chunk was about 219 kB (vendor); individual chunks are below 500 kB. This meets the stated per-chunk scale goal better than the old report's single-bundle result.

---

## 4. Specification and infrastructure gaps

### Required stack / developer experience

1. No TypeScript, `strict: true`, or typecheck task.
2. npm is used instead of pnpm 9. Root package contains runtime dependencies, contrary to the requested scripts/dev-dependencies-only root.
3. API uses Express 5, while the specification allows Express 4 or Fastify 4.
4. Redis, Zod, Prisma/Drizzle, JWT, pino/pino-pretty, shadcn/ui, TanStack Query, Zustand, Recharts, Vitest, and Playwright were not found in the workspace manifests/configuration.
5. API and bot package manifests have no scripts; web provides only `dev`, `build`, and `preview`. Required per-app `start`, `lint`, `typecheck`, and `test` scripts are incomplete/missing.
6. Root task scripts mostly run npm scripts directly; they do not consistently delegate tasks through Turbo.

### CI, deploy, and containers

1. Only `.github/workflows/verify.yml` exists; no separate requested `ci.yml` and no deploy workflow.
2. Verify workflow uses Node from `.node-version`, npm caching/install, and `npm run verify`; it does not run the requested Node 20 + pnpm 9 install/lint/typecheck/test/build sequence.
3. No app Dockerfiles, Docker Compose definitions, Docker healthchecks, `.dockerignore`, or GHCR publish/deploy job were found.
4. Deployment is configured for Render (`render.yaml`), not Docker-to-GHCR deployment. No separate API/bot health-check-after-deploy workflow was found.

### Target structure

The top-level app/package separation mostly exists. However, `tests/`, `docs/`, and root tooling/config files are also tracked outside `apps/` and `packages/`; a literal interpretation of “no code outside apps/packages” would require clarifying how tests and repository tooling are treated. Cross-app workspace imports are used for shared/database packages, but this was not exhaustively proven for every import.

---

## 5. Existing checklist: findings, not assumptions

| Checklist item | Discovery result |
|---|---|
| Duplicate command loading | No repeated normal-start load observed; duplicate names are not explicitly rejected. |
| Listener leak on reload | No reload path found; `loadEvents()` does not remove old listeners if called again. |
| Global error handlers | Process-level rejection/exception handlers exist; Discord client error listener is absent. |
| Slash-command 429 | Bulk PUT is used; Discord REST handles route limits. Custom retry policy not found. |
| Broad intents | MessageContent is used; GuildPresences requires follow-up validation. |
| Sharding threshold | No sharding implementation found. |
| Wildcard CORS | No wildcard API CORS found; Socket.IO origin is configured restrictively. |
| Auth/API rate limits | Present but primarily process-local, not Redis-backed. OAuth start has a specific limit. |
| JWT refresh rotation | Not applicable to the current cookie-session architecture; no JWT refresh flow found. |
| OAuth state / CSRF | OAuth state and unsafe-method origin checks are present; PKCE is absent. |
| N+1 queries | No issue established in the examined guild overview/list code; overview uses batch reads. |
| DB indexes | PostgreSQL indexes exist; comprehensive requirement-specific guild/user index audit remains open. |
| Secrets / env files | `.env.example` exists and `.env` is ignored; no committed `.env` was found. Historical secret scanning was not repeated in this Phase 0. |
| API boundary validation | Custom validation middleware and local checks exist; no Zod-based systematic boundary schemas. |
| Login redirect loop | Existing auth tests pass, but no Playwright/browser E2E was available to verify a real OAuth redirect/cookie flow. |
| Auth token in localStorage | Not found; browser uses credentials-included requests and HttpOnly session cookie. |
| Loading/error states | Shared loading fallbacks and API error handling exist; no full-page manual UX audit was performed. |
| Unnecessary re-renders | Not comprehensively profiled; no React performance profiler run. |
| Bundle/code splitting | Lazy page loading and multiple chunks confirmed; build succeeds. |
| Inconsistent imports | Workspace imports exist; full import-alias compliance has not been proven. |

---

## 6. Checks run in this discovery

| Check | Result |
|---|---|
| `npm run lint` | **PASS** |
| `npm test` (unit + security) | **PASS** |
| `npm run build:web` | **PASS** — Vite 8.3, 1,964 modules transformed |
| `npm run validate:release` | **PASS** |
| `npm audit --omit=dev --audit-level=high` | **FAIL** — 5 production findings (4 high, 1 critical) |
| `npm ci --ignore-scripts` | Completed; environment warned that installed Node 22.22.3 differs from pinned 22.12.x |

Production audit findings reported by npm:

- `proxy-addr`: **critical**, IPv4-mapped IPv6 trust-subnet IP spoofing.
- `body-parser`: **high**, denial of service with malformed compressed request bodies.
- `follow-redirects`: **high**, cross-origin credential stripping bypass / credential exposure advisories.
- `multer`: **high**, denial of service on pending asynchronous file filter after request teardown.
- `undici`: **high**, multiple denial-of-service and integrity advisories.

npm reports fixes are available. This report does not update dependency manifests or the lockfile.

---

## 7. Phase 0 conclusions / decisions before implementation

**Recommended first priority:** resolve and re-audit production dependency vulnerabilities, since the current release gate will fail at its production audit step.

Before a larger migration, decide whether the specification requires literal stack replacement (pnpm, strict TypeScript, Redis, Zod, database ORM, Docker/GHCR) or whether the current tested architecture is allowed to meet equivalent goals. The requested target has significant cost and architectural impact; in particular, moving to separate services changes the current live-client/cache coupling between bot and API.

If implementation is authorized, preserve the passing security and route-contract suites, and add missing checks before refactoring: explicit duplicate-command detection, listener idempotency/removal, client error handling, intent audit, sharding design, auth-flow browser E2E, and API schema coverage.

## 8. Addendum checklist cross-check — remaining evidence gaps

The Phase 0 checklist table above accounts for every Addendum problem-zone category. This cross-check adds detail where the report previously summarized the result or marked it as only partially checked. “Unverified” below means the repository evidence is not enough to claim the behavior is safe or defective; it is not a finding of a confirmed bug.

| Addendum area | Report coverage / additional finding | Still needed for a conclusive check |
|---|---|---|
| Bot command duplication | Normal startup loads the command tree once; no reload path found. Duplicate names overwrite in the collection instead of failing explicitly. | Add a duplicate-name assertion and test repeated initialization if reload is ever supported. |
| Event listener cleanup | The event loader does not unregister earlier listeners when invoked again. `loadServicesOnce` guards normal bootstrap. | Decide whether reload is supported; if yes, add listener ownership/removal and a repeated-load test. |
| Global errors | Process-level handlers exist; `client.on('error')` was not found. | Verify handling/exit policy under simulated client errors and rejection cases. |
| Bulk slash-command 429 | Commands are bulk PUT per guild/global. No custom retry was found; the `discord.js` REST client owns normal REST rate-limit handling. | No simulated 429/retry test was run; verify the failure behavior if deployment reliability requires it. |
| Intents / sharding | `MessageContent` is used by moderation and auto-response. `GuildPresences` use was not established. No shard manager or threshold exists. | Confirm whether the live bot exceeds 2,500 guilds; inspect all intent-dependent features, especially presences, before changing intents. |
| API rate limits | More specifically: a process-local global limit is 400 requests/minute/IP (health and auth-status are exempt); Discord OAuth start has 20/5 minutes; account registration/login/MFA/recovery and several account mutations use database-backed auth limits. Endpoint-specific coverage is not uniform, and shared Redis-backed limiting is absent. | Inventory every `/api/auth/*` and `/api/*` route, inspect its effective limit and key, and test multi-instance behavior. |
| OAuth / session | OAuth `state` and CSRF origin checks exist; PKCE and JWT refresh rotation do not. Auth is a server-side session-cookie design rather than a JWT design. | Browser-level OAuth callback/cookie/redirect testing is absent; choose whether PKCE is a mandatory requirement for this design. |
| N+1 / list queries | The report checked guild overview batching and the in-memory guild list only. | Trace every guild/member/user list path (including developer and member routes) and measure query/API call counts at representative sizes. |
| Database indexes | `account_identities` has primary key `(provider, provider_user_id)` for Discord identity lookup; per-guild bot configuration is stored in `bot_kv` with a text prefix index, rather than a relational `guildId` column. | Review all query patterns and production query plans; no comprehensive guild/user index audit was run. |
| Secrets / environment files | A current filesystem and Git-tracked filename scan found only `.env.example`; no committed `.env` was found. | No current source/history secret-pattern scan was run in Phase 0. Run one before declaring secret hygiene fully verified. |
| Request validation | The custom validator and route-level checks are known; no route-by-route completeness matrix exists. | Map every mutating/API boundary to its validator, limits, and failure test; then decide whether Zod is required. |
| Frontend auth storage / redirect | Auth token storage in localStorage was not found; the client uses cookie credentials. | Exercise real OAuth redirects and session persistence in a browser; the existing automated tests are not Playwright E2E. |
| Loading/error UX | Shared loading fallbacks and API error handling exist. | Manually inspect every screen's loading, empty, network-error, and expired-session states. |
| Re-renders / memoization | No React profiler or render trace was collected. | Profile representative heavy pages before proposing memoization changes. |
| Bundle threshold | Route-level lazy chunks are confirmed and each emitted JS chunk is below 500 kB; the largest listed is ~219 kB. | Measure the actual initial-entry transfer (and clarify whether the 500 kB limit means raw or gzip); the report only recorded emitted chunk sizes. |
| Imports / package placement | Web manifest does **not** depend on `discord.js`. Root does contain runtime `dotenv` and `file-type`, so it is not scripts/dev-dependencies-only. | Run a full dependency-ownership and import-alias audit; current report did not prove every cross-app import uses a workspace package. |
| `.env.example` completeness | The example exists and no other `.env*` file was found in the current checkout. | Compare all environment-variable reads against the example and deployment configuration; presence alone does not establish completeness. |

**Phase 0 ends here. No implementation changes were made.** The discovery report and this checklist cross-check are ready for review before proceeding to a migration/implementation phase.
