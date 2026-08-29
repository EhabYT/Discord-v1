# File Cleanup and Organization Report

Date: 2026-08-29  
Status: **Completed and verified**

## Result

The repository was audited before deletion using static dependency resolution,
convention-loader discovery, Vite chunk closure, duplicate hashes, Git state,
script references, and the full test/build gate.

```text
Production JS/JSX modules audited: 241
Reachable/convention modules:      241
Confirmed dead production modules:   0
Missing local imports:                0
Generated Vite chunks:               81
Reachable Vite chunks:               81
Dead generated chunks:                0
Discord commands preserved:         100
HTTP routes preserved:              183
Guild routes preserved:             105
```

No production module was deleted because none met the evidence threshold for a
dead file. This avoids breaking dynamically loaded Discord commands/events.

## Deleted confirmed disposable files

The following ignored runtime artifacts were removed from the workspace:

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

They are generated at runtime and are not source. `logs/.gitkeep` remains.

## Documentation organization

Moved 27 historical documents into clear ownership groups:

```text
docs/authentication/   15 files
docs/optimization/      8 files
docs/deployment/        4 files
docs/audit/             existing original audit history
docs/                    current index and cross-cutting reports
```

All root README and cross-document references were updated. `docs/README.md`
was rewritten as the canonical documentation index.

## Files deliberately retained

- all command/event modules, because directory loaders consume them;
- all production modules, because all 241 are reachable;
- all current Dashboard chunks, because all 81 are in the dynamic-import
  closure rooted at `dashboard/public/index.html`;
- `dashboard/static` source assets and their expected `dashboard/public` build
  copies;
- package lockfiles and Supabase schema;
- migration script and its Python SQLite reader;
- CI, release validation, tunnel, and live-smoke scripts;
- vendored `file-type` patch required for compatibility/security tests;
- manual/unit/security tests;
- historical manifests/reports as engineering and audit evidence.

## Duplicate-file classification

The only meaningful identical tracked blobs are expected Vite source/output
copies:

```text
dashboard/static/eb_logo.png   dashboard/public/eb_logo.png
dashboard/static/eb_logo.svg   dashboard/public/eb_logo.svg
dashboard/static/fonts/...     dashboard/public/fonts/...
```

Deleting either side would break source builds or current archive/static serving
behavior, so they were retained.

## Documentation integrity

```text
Broken relative Markdown links: 0
Stale old documentation paths:  0
```

## Full verification

```text
npm run verify:                    PASS
Release configuration:            PASS
ESLint errors:                        0
ESLint warnings:                      0
Unit suites:                    12 PASS
Security suites:                23 PASS
Discord commands:                   100
Audited HTTP routes:                 183
Root production vulnerabilities:      0
Dashboard production vulnerabilities: 0
Dashboard modules transformed:      1,817
Dashboard build:                    PASS
Main JS:                         264.11 kB / 83.00 kB gzip
```

The expected Node engine warning occurs only because the sandbox uses Node
20.20.2; CI and Render remain pinned to Node 22.12.0.
