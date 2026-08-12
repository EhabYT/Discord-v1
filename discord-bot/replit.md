# replit.md

## Overview

This is a full-featured Discord bot built with Node.js, providing moderation, music playback, economy/engagement systems, ticketing, and a web dashboard. The bot uses Discord.js v14 with slash commands and is designed to be deployed as a single-server or multi-server bot. It includes AutoMod (spam, profanity, links, caps detection), a music player via `discord-player`, an economy/points/leveling system, a giveaway system, a ticket support system, reaction roles, welcome messages, a verification system, and comprehensive logging.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Application Entry Point
- `index.js` is the main entry point. It initializes the Discord.js `Client` with extensive intents/partials, attaches a command `Collection`, the database, helper utilities, and a `discord-player` `Player` instance.
- Commands are deployed as Discord slash commands (via `deploy-commands.js` / `utils/startup.js`).
- Events are loaded dynamically from the `events/` directory.
- A scheduler system (`scheduler.js`) runs periodic background jobs (e.g., temp ban expiry, giveaway checks, reminders).

### Command Architecture
- All commands live in the `commands/` directory as individual files.
- Each command exports a `data` property (a `SlashCommandBuilder`) and an `execute(interaction, client, db)` function.
- Some commands set `defer: true` for long-running operations.
- Commands are organized by function: moderation (`ban`, `kick`, `timeout`, `warn`, etc.), music (`play`, `stop`, `skip`, `queue`, etc.), utility (`ping`, `info`, `avatar`, `poll`, `remind`, etc.), and admin (`automod`, `logging`, `welcome`, `ticket`, `reactionrole`, `setupverification`).

### Database
- Uses **better-sqlite3** via `quick.db` (v9) as a key-value store, wrapped through `utils/db_wrapper.js`.
- Data is stored with composite keys like `automod_{guildId}`, `stats_{guildId}_{userId}`, `warnings_{guildId}_{userId}`, `tickets_{guildId}`, etc.
- This is a file-based SQLite database — no external database server needed.
- The `db` object is attached to `client.db` and passed to every command's `execute` function.

### Music System
- Powered by `discord-player` v7 with `@discord-player/extractor` and `@discord-player/opus`.
- Supports YouTube, Spotify (via `spotify-url-info`), and auto search.
- Features include: play, pause, resume, skip, stop, queue, shuffle, loop modes, autoplay, volume control, audio filters (bassboost, nightcore, etc.), lyrics (via `genius-lyrics`), and a persistent music control channel (`music-setup`).
- DJ permission system: checks if the user has a DJ role before allowing control commands when others are in the voice channel (`checkDJPerms` in helpers).

### Web Dashboard
- Express v5 app served from `dashboard/server.js` on port 5000 (configurable via `DASHBOARD_PORT` env var).
- Uses `express-session` for session management, `compression` for response compression.
- Serves static files from `dashboard/public/`.
- Includes a custom rate limiter (IP-based, 200 requests per minute).
- Session secret from `DISCORD_CLIENT_SECRET` env var.

### Logging & Utilities
- Custom logger (`utils_logger.js`) writes to `logs/general.log` and `logs/error.log` with file rotation (5MB max, 5 rotated files).
- Console output uses colored/themed formatting with emoji icons for different log levels.
- Helper utilities in `utils/helpers.js` provide: `safeReply` (safe interaction replies), `parseTimeString`, `formatDuration`, `hasModPerms`, `checkDJPerms`.

### Scheduler
- `scheduler.js` provides a job scheduler using `setInterval` with automatic error tracking and job removal after 5 consecutive failures.
- Jobs are registered in `utils/scheduler_jobs.js` for periodic tasks like checking temp bans, giveaway expiry, and reminders.

### Configuration
- `config.json` stores static config: color palette, emoji mappings, and profanity word list for AutoMod.
- Environment variables (via `.env` and `dotenv`): `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL`, `DASHBOARD_PORT`, `LOG_LEVEL`.

### Event System
- Events are loaded dynamically from the `events/` directory via `events/index.js` using `loadEvents()`.
- Handles Discord events for: message tracking (edits/deletes), member joins/leaves, voice state changes, reaction roles, AutoMod enforcement, welcome messages, verification button clicks, ticket interactions, music player events, and logging.

## External Dependencies

### Core
- **discord.js** v14 — Discord API framework
- **discord-player** v7 + **@discord-player/extractor** + **@discord-player/opus** — Music playback engine
- **@discordjs/voice** v0.19 — Voice connection management
- **better-sqlite3** v12 + **quick.db** v9 — Local SQLite key-value database
- **dotenv** — Environment variable management

### Music-Related
- **ffmpeg-static** — FFmpeg binary for audio processing
- **mediaplex** — Media utilities for discord-player
- **play-dl** — Alternative audio stream source
- **spotify-url-info** — Spotify URL metadata extraction
- **youtube-ext** — YouTube extraction utilities
- **genius-lyrics** — Song lyrics fetching

### Web Dashboard
- **express** v5 — HTTP server framework
- **express-session** — Session management
- **compression** — Response compression middleware

### Utilities
- **axios** — HTTP client (for external API calls)
- **uuid** — Unique ID generation (used for warning IDs)
- **nodemon** — Development auto-restart

### External APIs
- **Discord API** — Bot interactions, slash commands, gateway events
- **QRServer API** (`api.qrserver.com`) — QR code generation for `/qr` command
- **Genius API** — Lyrics search (via `genius-lyrics` / discord-player lyrics)
- **YouTube/Spotify** — Music search and playback sources