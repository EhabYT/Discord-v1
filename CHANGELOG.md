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

## [3.0.0] - Initial V2 Release

### Added
- Complete rewrite with Express API + React dashboard
- Discord OAuth integration
- Socket.IO and SSE real-time features