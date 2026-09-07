# Changelog

## [Unreleased]

### Added
- ProBot-style welcome variables: `[user]`, `[userName]`, `[server]`,
  `[memberCount]`, `[inviter]`, `[inviterName]` now resolve everywhere the
  `{...}` forms do (join message/embed/DM, leave message, dashboard test),
  via one shared `shared/utils/welcome-vars.js` helper (covered by
  `tests/unit/welcome-vars.test.js`). Leave messages also gained `{userName}`.
- Giveaway default settings (`GET/POST /api/guild/:id/giveaways/settings`):
  default channel, duration, winners, color, DM-winner flag, and required
  role. The dashboard Giveaways page has a Defaults card and pre-fills every
  new giveaway form from them. Giveaways also accept a free-text host (shown
  on the card and the Discord panel), a custom duration beyond the presets,
  and the Discord panel now lists the required role when one is set.
- DB-less fallback now snapshots dashboard settings to
  `database/ephemeral-fallback.json` (gitignored), so restarts no longer wipe
  reaction-role panels and other configs. Sessions still reset on restart;
  Supabase PostgreSQL remains the production store.

### Changed
- Dashboard dependencies upgraded: `lucide-react` 0.577 → 1.x,
  `autoprefixer` → 10.5.5, `postcss` → 8.5.28. Tailwind stays on v3
  (v4 needs a config migration with visual regression risk).
- Dashboard Music desk (`Music` page and `/api/music/*`) is now restricted to
  `DEVELOPER` and `SUPER_ADMIN` system roles. Frontend navigation, command
  palette, mobile dock, and overview shortcuts hide it from everyone else;
  the backend fails closed with `403 SYSTEM_ROLE_REQUIRED`. Discord `/play`
  and guild DJ levels are unchanged.

## [3.1.0] - 2026-08-29

### Added
- V2 architecture with full account system (email, MFA, avatars, sessions)
- Bilingual (EN/AR) dashboard with RTL/LTR support
- 100 categorized slash commands
- Developer Control Center with role-based access
- Comprehensive security audit and test suite

### Changed
- Migrated from quick.db SQLite to Supabase PostgreSQL
- Restructured middleware into shared `guild-access.js`
- Fixed cross-guild access vulnerability in `routes/permissions.js`
- Removed duplicate assets from `dashboard/public/` (source of truth: `dashboard/static/`)
- Reorganized 100 bot commands into categorized subdirectories under `bot/src/commands/`
- Replaced vendored `file-type` package with npm registry version
- Removed hardcoded cloudflared path from `scripts/keep-tunnel.sh`
- Added `.editorconfig`, `.prettierrc`, `SECURITY.md`, `CONTRIBUTING.md`
- Removed `vendor/` directory
- Updated `eslint.config.js` to remove stale `vendor/**` ignore pattern
- Replaced SHA-256 token hashing with argon2id in `database/accounts.js`
- Exported `emitLog` from `backend/server.js` and replaced cross-package relative imports with package names (`eb-bot`, `eb-bot-backend`)
- Added `bot/package.json` and `backend/package.json` for proper package resolution
- Replaced hardcoded `/home/user/.npm/_npx/` path in `scripts/keep-tunnel.sh` with `npm root -g`
- Fixed `db.allByPrefix is not a function` by adding wrapper on `db` object in `database/index.js` and updating `rank.js`/`birthday.js` to use `scanPrefix`
- Added `eb-bot-database` and `eb-bot-shared` packages with subpath exports
- Replaced all `../../../database/` and `../../../shared/` relative imports in `backend/src/` with package-based imports
- Graceful startup without `DATABASE_URL` (`shared/services/startup.js` warns instead of blocking) and automatic dashboard port fallback on `EADDRINUSE` (`backend/src/server.js`)
- Fixed `argon2.hash` salt type in `database/accounts.js` (Buffer instead of hex string) and dropped redundant `async`
- Bumped `file-type` to `^22.0.2` (ESM-only): verified the zero-size ASF sub-header hang fixed upstream; rewrote `tests/security/dependency-patches.test.js` with dynamic `import()` and documented the nested `file-type@16.5.4` exposure under `@discord-player/extractor`
- Fixed `scripts/lint-gate.js` on Windows (`.cmd` shim + shell execution)
- Cleaned runtime artifacts (`logs/*.log`, stray `.env` copy)
- Python interpreter fallback (`python3` → `python`, `PYTHON` env override) in `scripts/migrate-sqlite-to-postgres.js` and `tests/security/migration.test.js` for Windows machines
- Fixed broken `require('eb-bot')` bare imports (bot entrypoint exports nothing): `dev.js` now uses `eb-bot/src/scheduler`, `scheduler-jobs.js` uses `eb-bot/src/events/voiceEvents` and `eb-bot/src/events/messageCreate` — restores `/api/developer/jobs` (was 500)
- Fixed stale flat command paths after categorization: `transaction-locks.test.js` points at `economy/*`/`community/giveaway.js`, `command-loader.test.js` walks subdirectories recursively (now validates 100 commands instead of 0), `tests/manual/command-execute.js` resolves categorized paths

## [3.0.0] - Initial V2 Release

### Added
- Complete rewrite with Express API + React dashboard
- Discord OAuth integration
- Socket.IO and SSE real-time features