# EB Bot — File Organization Report

**Date:** 2026-08-14
**Branch:** `arena/01a0026f-discord-v1`

## Executive summary

The repository arrived as a transport/export layout rather than a runnable project: a partial newer tree under `Discord-v1/`, old source fragments at the repository root, and a bare Git recovery archive in `Discord-v1-backup.git/`. The archive was inspected read-only and its 256-file tip was used to recover the source that was absent from the partial tree. Newer files were then overlaid by path before any migration took place.

The result is one runnable Node.js application with four clearly owned areas:

- `bot/` owns Discord commands, gateway/player events, scheduling, and the process entry.
- `backend/` owns Express, API routes, middleware, SSE, and Socket.IO.
- `dashboard/` is the one React/Vite frontend; no duplicate `frontend/` was created.
- `database/` owns the QuickDB adapter, lock implementation, and preserved SQLite path.

Bot and backend remain in one process by design. The backend receives the live Discord client and uses its guild/member/role caches; this folder separation does not invent a second gateway login or an IPC layer.

## Final project tree

```text
EB-Bot/
├── .github/workflows/ci.yml       # clean install, lint, tests, build, DB check
├── backend/
│   └── src/
│       ├── middleware/
│       │   ├── auth.js
│       │   ├── csrf.js
│       │   ├── devauth.js
│       │   ├── errors.js
│       │   ├── guild-access.js
│       │   ├── permissions.js
│       │   └── rate-limit.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── dev.js
│       │   ├── guilds.js
│       │   ├── music.js
│       │   ├── permissions.js
│       │   └── stats.js
│       ├── utils/sse.js
│       ├── websocket/socket.js
│       └── server.js
├── bot/
│   └── src/
│       ├── commands/              # 100 slash commands
│       ├── events/                # gateway + player handlers
│       ├── index.js
│       └── scheduler.js
├── dashboard/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── main.jsx
│   │   ├── nav.js
│   │   └── socket.js
│   ├── static/                    # Vite source assets
│   ├── public/                    # generated production build
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── database/
│   ├── index.js
│   ├── lock.js
│   └── json.sqlite
├── shared/
│   ├── lib/logger.js
│   ├── services/
│   └── utils/
├── config/bot.json
├── tests/
│   ├── manual/
│   ├── security/
│   └── unit/
├── scripts/
├── docs/
│   └── audit/
├── logs/                          # ignored runtime output
├── .env.example
├── .gitignore
├── eslint.config.js
├── package.json
├── package-lock.json
└── README.md
```

## Migration accounting

Git rename detection at 50% similarity reports:

| Operation | Count | Notes |
| :--- | ---: | :--- |
| Files/blob instances analysed | 468 | 212 outer tracked paths + 256 recovery-tip paths |
| Candidate files after safe overlay | 289 | Complete baseline plus newer files |
| Rename/move operations detected | 135 | 118 same-basename moves + 17 basename changes (including the rebuilt asset hash) |
| Added paths | 119 | Primarily recovered commands, missing backend files, tests, and CI |
| Deleted old paths | 72 | Recovery archive, duplicate source, generated logs, placeholders, duplicate reports |
| Final deliverable files | 258 | Excludes dependencies and ignored runtime logs; includes this report |

No source implementation was duplicated between application areas. Duplicate old root fragments were removed only after their blobs were compared with the recovery baseline/newer overlay. Generated logs were removed from Git but retained as ignored runtime files in the workspace.

## Path migration

The migration updated:

- static `require()`, ESM `import`, exports, and test references;
- dynamic command/event loaders;
- package entry points and scripts;
- Vite `publicDir`/`outDir` paths;
- Express static and SPA fallback paths;
- logger, public URL, log, database, and developer-diagnostics paths;
- test route/source inventories;
- configuration and documentation references.

A final resolver audit found **0 unresolved local imports**. Dynamic loaders successfully load all 100 commands and all 23 event files.

## Database safety

- Original SHA-256: `668487a3328effdb26d51824de955e6e270bd611dcc0ba362d9dbdbd1d115350`
- Final SHA-256: `668487a3328effdb26d51824de955e6e270bd611dcc0ba362d9dbdbd1d115350`
- Tables/rows before migration: `json` = 38, `main` = 0
- Tables/rows after migration: unchanged

The runtime path is now explicit: `database/json.sqlite`, overridable with `DATABASE_PATH`. Automated tests use isolated temporary SQLite files, so regression runs cannot mutate production data.

## Validation

| Gate | Result | Evidence |
| :--- | :---: | :--- |
| Local import/require resolver audit | PASS | 0 unresolved paths |
| JavaScript syntax audit | PASS | all non-generated `.js` files |
| Unit/loader test | PASS | 100 commands, 0 errors; events/services load |
| Security/regression tests | PASS | 9 suites, 137 assertions |
| Route inventory | PASS | exactly 151 concrete API routes |
| Dashboard build | PASS | 1,803 modules; reproducible asset hashes |
| ESLint | PASS | 0 errors / 0 warnings; baseline locked at zero |
| CI workflow | PASS | clean install, native SQLite, verify, bundle drift, DB integrity |
| Backend start | PASS | bound `0.0.0.0`; `/api/health` returned 200 |
| Dashboard serve | PASS | generated SPA returned 200 |
| Database integrity | PASS | byte-for-byte SHA-256 match |
| Bot source/load | PASS | 100 commands and 23 events; live login requires deployment credentials |

## Final checklist

- [x] All source files classified
- [x] Backend separated
- [x] Dashboard/frontend separated without duplication
- [x] Discord bot separated
- [x] Database adapter and locking organized
- [x] Shared code organized by service/helper ownership
- [x] Tests, scripts, config, and documentation organized
- [x] Root reduced to project-wide files/directories
- [x] File names standardized where safe
- [x] No duplicate source files
- [x] No unresolved imports/requires
- [x] Dynamic loaders verified
- [x] Package scripts and entry points verified
- [x] Environment-dependent paths updated
- [x] API, auth, CSRF, guild isolation, hierarchy, Socket.IO paths validated
- [x] Dashboard build validated
- [x] Database bytes preserved
- [x] No secret file added

```text
========================================
EB BOT — FILE ORGANIZATION REPORT
========================================
FILES ANALYZED: 468 blob instances / 289 assembled candidates
FILES MOVED: 135 Git-detected moves/renames
FILES RENAMED: 17 basename changes (including generated asset hash)
FILES DELETED: 72 obsolete paths (archive/duplicates/logs/placeholders/reports)
FILES CREATED: 119 paths (recovered source, backend infrastructure, tests, and CI)
BACKEND: PASS — 16 files, 151 API routes
FRONTEND: NOT SEPARATE — dashboard is the only frontend by design
DASHBOARD: PASS — React/Vite source and generated output separated
BOT: PASS — 100 commands and 23 event files load
DATABASE: PASS — exact SHA-256 preserved
SHARED: PASS — services, utilities, logger separated
TESTS: PASS — unit/security suites organized
SCRIPTS: PASS — package and filesystem references updated
DOCUMENTATION: PASS — README, audit history, lessons, final report
BROKEN IMPORTS: 0
BROKEN REQUIRES: 0
BROKEN PATHS: 0
BUILD: PASS
TESTS: PASS
SECURITY TESTS: PASS
BOT: PASS (source/load; live Discord login needs credentials)
BACKEND: PASS
DASHBOARD: PASS
DATABASE: PASS
FINAL STATUS: READY
```
