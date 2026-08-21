# EB Bot V2 — Complete Test Report

Date: 2026-08-21  
Result: **PASS**

## Verification command

```bash
npm ci --ignore-scripts
npm --prefix dashboard ci --ignore-scripts
npm run verify
```

## Summary

| Area | Result |
|---|---|
| ESLint gate | PASS — 0 errors, 0 warnings |
| Discord command loader | PASS — 100 commands |
| Security suites | PASS — 20 suites |
| API inventory | PASS — 153 routes |
| Backend syntax | PASS |
| JSON validation | PASS |
| Dashboard production build | PASS |
| Root production audit | PASS — 0 vulnerabilities |
| Dashboard production audit | PASS — 0 vulnerabilities |
| Secret scan | PASS — no tracked credentials |
| Merge-conflict scan | PASS |
| Broken-symlink scan | PASS |

## Security suites

- Authentication and fail-closed behavior
- Discord role hierarchy and privacy redaction
- Guild isolation and CSRF
- OAuth state, replay prevention, session regeneration, and XSS escaping
- Bulk-action limits and endpoint rate limiting
- Economy and giveaway concurrency
- Event/error resilience and graceful shutdown
- Error classification and request correlation
- Complete API authorization sweep
- Patched dependency regression
- PostgreSQL OAuth sessions
- Supabase JSONB adapter
- Legacy SQLite migration
- Guild-scoped SSE delivery
- Local-only environment editor
- V2 readiness contract
- Developer system-role model
- Direct Developer API authorization
- Performance metrics and identifier normalization
- Backend-enforced maintenance mode

## Developer authorization matrix tested

- Ordinary user denied from every Developer endpoint
- SUPPORT allowed read-only overview
- SUPPORT denied environment and feature writes
- DEVELOPER locked before second factor
- DEVELOPER unlocked with independent DEV_TOKEN
- DEVELOPER allowed database diagnostics
- DEVELOPER denied command deployment
- OWNER automatically receives SUPER_ADMIN
- Legacy `/api/dev/*` redirect preserves HTTP method

## Production build

Vite 8.2.2 transformed 1,806 modules successfully. Pages remain code-split; the
main bundle is approximately 259 kB before gzip and 82 kB gzip. Developer,
System Status, Logs, Members, Verification, and other pages load as separate
chunks.

## Dependency state

Updated compatible runtime/build patches:

- `@napi-rs/canvas` 1.0.7
- `vite` 8.2.2
- `@vitejs/plugin-react` 6.1.0

Major upgrades for ESLint, Tailwind, and Lucide were intentionally not forced
because they require separate migration work and are not security fixes.

## Expected test logs

The error suite intentionally throws synthetic filesystem and internal errors.
Their backend stack traces appearing in test logs are expected. The tests verify
that clients receive only sanitized messages and a request ID.

Tests also run without real Discord/Supabase credentials, so local warnings about
missing `DATABASE_URL`, `CLIENT_ID`, and `DISCORD_CLIENT_SECRET` are expected.

## Runtime note

The project is pinned to Node 22.12 LTS for Render. The sandbox test runner uses
Node 20.20.2 and therefore prints `EBADENGINE`; the code still completed every
test here. Production should use the pinned Node 22.12 runtime.

## External integration boundary

No live Discord token or Supabase password was used. Full external validation
still requires newly rotated credentials configured directly in Render or a
local `.env` file. Previously posted credentials must not be reused.
