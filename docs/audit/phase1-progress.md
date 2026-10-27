# Fixes → Optimize → Cleanup → Sort — Progress and Verification

**Date:** 2026-10-25  
**Branch:** `arena/e30916a0-discord-v1`
**Status:** implementation phases completed; local verification passes; GitHub deployment gate remains externally blocked.

This report supersedes the earlier Phase 1-only progress notes. The Phase 0 discovery report remains a historical baseline; it records the repository before these changes.

## Scope decisions

- Preserved the existing JavaScript/npm-workspace, Express, PostgreSQL, Discord.js, React/Vite, and Render architecture. No breaking migration or database schema migration was introduced.
- Kept Render auto-deploy disabled. Do not deploy unless GitHub Actions **Verify** is green for the exact commit selected for deployment. A local verification pass does not satisfy this gate.
- No live deployment or real-provider login was performed.

## 1. Fixes

- Added bounded bot bootstrap retries (configurable from 1 to 20; default 8), retry backoff, and heartbeat timer cleanup on shutdown.
- Bounded member listing/search to 100 results; validated member/action/note/warning inputs; bounded moderation reasons, timeout durations, role lists, and warning cleanup batches.
- Added route-isolated heavy-read rate limits for high-cost guild endpoints and a bounded request limit for member actions.
- Added regression coverage for retry limits, route isolation, and guild-member route bounds.
- Added `.env.example` entries for optional Google OAuth and the bot bootstrap retry setting.

## 2. Optimize

- Replaced bot leaderboard full-member scans with database-side top-10 ranking.
- Replaced server-stat per-member reads with a database-side prefix aggregate.
- Added the `total` score to both Memory and PostgreSQL leaderboard adapters and API sorting.
- Reused cached Discord users and bounded leaderboard/birthday enrichment to batches of eight.
- Reused cached guild members in birthday and birthday-role scheduler jobs before making REST requests.
- Added keyed process-local advisory locking to the MemoryDatabase fallback, matching the critical-section behavior expected by the shared database lock API.

## 3. Cleanup

- Removed the tracked Playwright `test-results/.last-run.json` artifact and ignored regenerated `test-results/` output.
- Reset the ESLint debt baseline to its measured current value: **0 errors / 0 warnings**.
- Kept `file-type` as a development dependency because the dependency regression suite imports it; it is no longer a production dependency.
- Removed obsolete Turbo configuration from `package.json`; `turbo.json` remains the single Turbo configuration source.
- Added per-workspace start/dev/lint/test commands where appropriate, plus root `lint:workspaces` and `test:workspaces` Turbo runners. Existing root operational commands and the Render entry point remain intact.
- Made bot/API `.env` loading resolve from the repository root so workspace-local scripts use the same development environment.

## 4. Sort

- Kept source modules in their existing ownership boundaries (`apps/` and `packages/`) rather than performing risky broad file moves or changing dynamic bot-loader paths.
- Organized workspace commands by responsibility and kept Turbo task configuration in `turbo.json`.
- Marked the Phase 0 report as a historical baseline so its original findings are not mistaken for current status.

## Verification

Latest completed checks:

| Check | Result |
|---|---|
| `npm run verify` | **PASS** (release config, lint gate, all unit/security suites, production audit, web build) |
| Lint gate | **0 errors / 0 warnings**, budget 0 / 0 |
| Production dependency audit | **0 vulnerabilities** |
| Web production build | **PASS** |
| Workspace `test` scripts | **PASS** in all seven app/package workspaces |
| `npm run lint:workspaces` | **PASS** |
| `git diff --check` | **PASS** on the final working tree |

The environment is Node 22.22.3 while the repository pins Node 22.12.x, so npm reports an engine warning. The checks passed on the available runtime.

## External gate and remaining boundaries

The most recent GitHub Actions Verify attempt did not start because the GitHub account is under a billing lock. This is not a code failure, but it means the exact-SHA CI gate is still **not green**. Resolve the billing issue, push this branch, and wait for Verify to pass on the exact intended deployment commit before any deployment. No deployment has occurred.

Real Discord/Google OAuth, live Render health, multi-instance rate-limit coordination, and browser-level end-to-end behavior were not exercised. These remain operational/integration validation items rather than reasons to change the architecture in this pass.
