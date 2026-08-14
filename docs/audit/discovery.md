# Phase 1 — Discovery Report

**Project:** EB Bot v3.1.0 · **Date:** 2026-08-14
**Scope:** full repository — bot, backend, dashboard, storage, tests, config, deployment
**Files modified during Discovery: 0** (working tree verified clean; the one build artefact and lockfile touched while validating were reverted)

---

## 1. Technology stack & structure

Plain **JavaScript** (no TypeScript), CommonJS on the server, ESM/JSX in the client.
Single process serves both the Discord bot and the dashboard API.

| Area | LOC | Files |
| :--- | ---: | ---: |
| `commands/` | 6 158 | 100 |
| `dashboard/client/src/` | 11 210 | 45 |
| `utils/` | 3 310 | 24 |
| `dashboard/routes/` | 2 599 | 6 |
| `events/` | 1 711 | 23 |
| `scripts/` | 1 860 | 9 |
| `dashboard/middleware/` | 368 | 5 |
| root (`index.js`, `server.js`, …) | 822 | 5 |
| **Total (excl. built assets)** | **~28 000** | **221** |

**Stack:** discord.js 14 · discord-player 7 · Express 5 · Socket.IO 4 · quick.db + better-sqlite3 · React 19 · Vite 8 · Tailwind

**Data flow:** Discord Gateway → `events/` → `utils/` services → `json.sqlite`.
Dashboard → Express (`middleware` → `routes`) → same services/DB → Socket.IO/SSE push to React.

---

## 2. Feature inventory (must survive any refactor)

```
Bot          100 slash commands · 13 gateway events · 9 player events
             9 scheduler jobs · 24 service modules
Backend      6 routers · 5 middleware · 152 endpoints · Socket.IO + SSE
Dashboard    28 pages · 11 shared components
Tests        6 security suites + 3 legacy scripts · 86 assertions
```

Verified present and loading: `npm test` passes 86/86, all 100 commands load with 0 errors.

---

## 3. Findings by severity

### 🔴 CRITICAL — none outstanding

The security programme from the previous passes holds. Re-ran the full suite rather than
trusting it: **86/86 pass**. Four-layer model (authentication → authorisation → guild
isolation → Discord hierarchy) intact.

### 🟠 HIGH

**H1 — Unhandled promise rejections from every async event handler**
`events/index.js:47,49` invokes `event.execute(...)` without `.catch()`. Every gateway
handler is `async`, so any rejection escapes to `process.on('unhandledRejection')`.
Reproduced:

```
unhandled rejection escaped to process level: handler blew up
```

Handlers have internal `try/catch` (7–12 blocks each), but coverage is partial — anything
thrown outside those blocks is unhandled. *Root cause: no error boundary at the event
dispatch layer.*

**H2 — Error handlers can themselves throw**
`index.js:101` does `reason.message` on the rejection value. Rejecting with a non-Error —
which `axios`, `discord.js` and any `Promise.reject('string')` can produce — makes the
handler read `.message` of a string (`undefined`) or of `null` (throws). Reproduced:
`logged: undefined`.

**H3 — `uncaughtException` does not exit**
`index.js:105` logs and continues. Node's documented contract is that the process is in an
undefined state after an uncaught exception; continuing risks corrupt SQLite writes.
Should log, flush, and exit non-zero for a supervisor to restart.

### 🟡 MEDIUM

**M1 — `dashboard/routes/guilds.js` is 1 787 LOC / 104 routes**
Single file holding roughly two-thirds of the API surface. This is the direct cause of the
critical bug found in the last audit (the `permissions` router was overlooked because
routing logic is not uniform across files). Highest-value structural fix.

**M2 — 128 duplicated error handlers**
`catch (err) { res.status(500).json({ error: err.message }) }` appears **104×** in
`guilds.js` alone, 128× across routes. No error classification, no correlation ID, no
mapping of Discord/DB errors to HTTP status. Violates §13.

**M3 — 8 `db.all()` full-table scans in `guilds.js`**
Each scans every key for every guild to filter by prefix. O(all guilds) per request.
Abuse is mitigated by the `heavyRead` limiter; the cost remains.

**M4 — Unbounded concurrency in 2 `Promise.all(.map(async …))` fan-outs**
Sized by data (member lists), so a large guild issues many simultaneous Discord calls.
No N+1 sequential-fetch loops found (checked: 0).

**M5 — No API abstraction in the frontend**
138 direct `api.*` calls scattered across 26 of 28 pages; no `api/` modules, no `hooks/`,
no `stores/`. Violates §12. 27 pages manage server state in ad-hoc `useState`/`useEffect`.

**M6 — Remaining read-modify-write races**
`utils/db_lock.js` exists and is applied to `/pay`, but 7 candidate sites remain
(XP, daily, work, rep, streak). Correctness rather than security — no value duplication —
but the same class of bug.

### 🔵 LOW / INFO

- **L1** — No ESLint config. §26 quality gate absent.
- **L2** — No Dockerfile / CI workflow. §26/§27 deployment gate absent.
- **L3** — `DASHBOARD_ORIGIN` read by `csrf.js` but missing from `.env.example` (17/18 documented).
- **L4** — `utils/public_url.js` exports `writePublicUrl` and `markDead`; **verified** zero external references. Genuinely dead.
- **L5** — Client bundle 617 kB / 160 kB gzip in one chunk; Vite warns. No code splitting.
- **L6** — 9 vulnerabilities, all `@discordjs/opus → node-pre-gyp → tar`, confirmed build-time only, no upstream fix.

### Verified healthy (checked, no action)

- **Build passes.** `vite build` succeeds and reproduces the committed hash
  `index-C7v5IZlx.js` byte-for-byte — the committed SPA is in sync with source.
- **No unused dependencies.** Every declared dependency is referenced.
- **No secrets in source or history** (369 blobs scanned previously; unchanged).
- **Event-name exports are not dead code** — the earlier heuristic flagged 11 candidates;
  inspection showed 9 are `Events.X` constants consumed by the loader. Only L4 is real.
- **No N+1 Discord fetch loops.**
- **No TypeScript** — §17 does not apply.

---

## 4. Risk classification & plan

| Phase | Work | Risk | Regression control |
| :--- | :--- | :--- | :--- |
| **2** | H1–H3: error boundary at event dispatch; harden process handlers | Low | New `test-resilience.js`; existing 86 must stay green |
| **3** | M2: shared `asyncHandler` + error classifier; keep response shapes identical | Low–Med | Assert existing status codes/bodies unchanged |
| **4** | M1: split `guilds.js` into domain routers behind one mount, no path changes | **Med** | Route-inventory diff must be byte-identical before/after |
| **5** | M5: extract `api/` modules + `hooks/`; rebuild and compare bundle | Med | Build must succeed; manual page smoke |
| **6** | M6, M3, M4: extend locking; cache/scope scans; bound fan-out | Low | Extend `test-concurrency.js` |
| **7** | L1–L3, L5: ESLint, `.env.example`, docs, code splitting | Low | Lint gate added to `npm test` |
| **8** | Final audit as a fresh reviewer; `docs/engineering-lessons.md` | — | Full re-run |

**Explicitly rejected:** the `apps/ packages/ database/` monorepo layout from the brief.
This is a single-process app with 28 k LOC and no separate deployables; splitting it into
workspaces would add build complexity, break every relative `require`, and invalidate the
committed SPA — cost without benefit. §3 permits a better-fitting structure. I will instead
modularise **within** the existing layout, which addresses the actual defect (M1) without a
Big-Bang rewrite (§29).

**Ordering rationale:** correctness bugs (H1–H3) before structure, because refactoring on
top of silent error-swallowing hides regressions. `guilds.js` (M1) comes after the shared
error handler (M2) so the split moves already-clean code.

---

## 5. Baseline to protect

```
npm test          86 assertions, exit 0
node --check      180 files, no syntax errors
vite build        ✓ 1803 modules, hash index-C7v5IZlx.js
git               640 commits, working tree clean
endpoints         152 (inventory captured for byte-diff after refactor)
```

Awaiting approval to begin **Phase 2**.
