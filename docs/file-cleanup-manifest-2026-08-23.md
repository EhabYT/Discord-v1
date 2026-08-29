# File Cleanup and Organization — Pre-Change Manifest

Date: 2026-08-23  
Status: **Audit complete before deletion/moves**

## Inventory

```text
Tracked files:                    441
Workspace files excluding deps:  449
Production JS/JSX modules:       241
Reachable production modules:    241
Unreachable production modules:    0
Missing local imports:              0
Discord commands:                 100
Dashboard generated assets:        81
Reachable generated assets:         81
Unreachable generated assets:        0
```

## Dynamic/convention roots preserved

Every file under these locations is a runtime root even when static inbound
references are zero:

```text
bot/src/commands/*.js
bot/src/events/**/*.js
```

The command/event loaders and deploy service enumerate those directories.
Nothing there is a deletion candidate.

## Confirmed expected duplicates

These byte-identical pairs are intentional source → build copies:

```text
dashboard/static/eb_logo.png  → dashboard/public/eb_logo.png
dashboard/static/eb_logo.svg  → dashboard/public/eb_logo.svg
dashboard/static/fonts/*      → dashboard/public/fonts/*
```

`dashboard/static` is Vite source input. `dashboard/public` is the current
production output consumed by Express and source archives. They are not dead.

## Confirmed deletion candidates

Only ignored runtime artifacts are confirmed disposable:

```text
.dashboard-url
logs/cloudflared.log
logs/dead-hosts.txt
logs/developer-audit.log
logs/error.log
logs/general.log
logs/keep-tunnel.lock
logs/tunnel-watch.log
```

`logs/.gitkeep` remains tracked so the runtime directory exists.

## Organization plan

Historical reports remain valuable and are not dead code. They will be grouped
without content deletion:

```text
docs/authentication/  account audit, manifests, reports
docs/optimization/    optimization phase manifests/reports
docs/deployment/      deployment manifests, report, runbook, live snapshot
docs/audit/           existing original audits (unchanged)
```

`docs/README.md` and root README links will be updated. Core long-lived files
remain at `docs/engineering-lessons.md` and `docs/file-organization-report.md`.

## Explicit non-candidates

- all 241 reachable production modules;
- all command/event convention modules;
- all 81 reachable Vite chunks;
- package lockfiles;
- Supabase schema;
- migration and SQLite reader pair;
- CI/release/live-smoke scripts;
- security/unit/manual tests;
- vendored `file-type` compatibility patch;
- audit history and engineering lessons.

## Completion gate

- no unresolved local import;
- 100 commands load;
- 183 API routes remain;
- lint zero errors/warnings;
- 12 unit and 23 security suites pass;
- both audits have zero vulnerabilities;
- Dashboard production build succeeds;
- generated asset closure remains complete;
- Git tree clean after commit.
