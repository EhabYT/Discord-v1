# Phase 1 — Fix pass progress

**Date:** 2026-10-25  
**Status:** targeted fixes completed and verified; broader stack migration and remaining optimization/cleanup work are not complete.

## Changes made

- Updated affected production dependencies and lockfile; raised the API's direct `multer` dependency to `^2.5.0`.
- Changed global and endpoint rate-limit identity to use Express's trusted `req.ip` instead of parsing the caller-controlled left-most `X-Forwarded-For` value.
- Extracted bot command loading into `apps/bot/src/handlers/command-loader.js`; duplicate command names now fail fast rather than silently replacing a command.
- Made `loadEvents()` remove only its own previous client/player listeners before registering again, avoiding duplicate listeners on reload while preserving unrelated listeners.
- Added a Discord client `error` handler.
- Removed the unused `GuildPresences` gateway intent; `MessageContent` remains because moderation and auto-response logic inspect message content.
- Added regression tests for duplicate commands, repeated event loading, client errors, and forwarded-header rate-limit bypass attempts.
- Added PKCE S256 to Discord and Google OAuth authorization/token exchanges and extended OAuth regression tests to verify the challenge/verifier binding.
- Added a dedicated Google OAuth start/callback limiter.
- Bounded birthday-list Discord user lookups to batches of eight, reused cached users, and applied the heavy-read rate limiter; added a reusable bounded async mapper with tests.
- Disabled Render auto-deploy and updated the deployment runbook/release validator so only a manually selected, CI-verified commit can be deployed.

## Verification

`npm run verify` passes, including release validation, lint gate, unit/security tests, production dependency audit, and web build. The production audit now reports **0 vulnerabilities**.

`npm audit` without `--omit=dev` still reports **3 moderate findings** in the Tailwind 3/PostCSS selector-parser development dependency chain. npm's forced fix would change Tailwind to v4, outside the supplied Tailwind 3 requirement; no forced major upgrade or incompatible parser override was applied.

The sandbox runs Node 22.22.3 while `.node-version` pins 22.12.0, so npm continues to emit an engine warning. Verification passed on the available runtime.

## Phase 5 deployment gate

Do not deploy until the GitHub Actions `Verify` workflow is green for the exact commit being deployed. A local `npm run verify` pass is useful but does not replace that CI result; red, cancelled, or missing CI is a hard stop. No deployment has been performed.

## Remaining Phase 1 scope

This pass keeps the existing architecture, as selected. Remaining work includes a complete route-by-route API rate-limit and validation inventory, real-provider/browser OAuth E2E, React render profiling, and a comprehensive production query/index review. The Addendum's TypeScript/pnpm/Redis/Docker stack migration was explicitly not selected. No live deployment or Discord provider login was exercised.
