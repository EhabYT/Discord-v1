# Changelog

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

## [3.0.0] - Initial V2 Release

### Added
- Complete rewrite with Express API + React dashboard
- Discord OAuth integration
- Socket.IO and SSE real-time features