# EB Bot

A Discord.js v14 bot with a React control panel — moderation, AutoMod, music,
XP/levels, tickets, verification, giveaways and reaction roles, managed from a
web dashboard with Discord OAuth login and role-based access control.

**Version** 3.1.0 · **Node** 22.12 LTS · **100 slash commands** (Discord's per-app limit) · **MIT**

---

## Contents

- [Quick start](#quick-start)
- [Security model](#security-model) ← read before exposing the dashboard
- [Configuration](#configuration)
- [Dashboard](#dashboard)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

---

## Quick start

Requires **Node 22.12 LTS**. The runtime is pinned so Render does not select an untested future major such as Node 26. The unused direct `@discordjs/voice` dependency was removed; Discord Player provides the voice transport used by this project.

```bash
git clone https://github.com/EhabYT/Discord-v1.git
cd Discord-v1

cp .env.example .env          # add Discord credentials + Supabase DATABASE_URL
npm install --omit=dev --ignore-scripts
npm start
```

Minimum viable `.env` for the **bot only** (no dashboard login):

```ini
DISCORD_TOKEN=your-bot-token
CLIENT_ID=your-application-id
```

To also use the dashboard you need Discord OAuth credentials — see
[Configuration](#configuration).

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Security model

The dashboard can ban members, assign roles, post as the bot and export your
server configuration. It is protected by **four independent layers** — each one
must pass, and each is covered by automated tests.

| Layer | Question it answers | Enforced by |
| :--- | :--- | :--- |
| **Authentication** | Who are you? | `backend/src/middleware/auth.js` — no session ⇒ `401` |
| **Authorisation** | What may you do? | `backend/src/middleware/permissions.js` — Viewer / DJ / Moderator / Admin |
| **Guild isolation** | Which server may you touch? | `backend/src/middleware/guild-access.js` — membership checked per request |
| **Discord hierarchy** | Whom may you affect? | `hierarchyError()` — mirrors the slash-command rules |

A valid login never implies access to every guild, route, member or role.

All four live in `backend/src/middleware/guild-access.js` and are composed by
`guildAccessStack()`, which fixes the order once:

```
requireAuthenticated → validateGuild → requireGuildMember → requirePerm
```

Order is part of the security property, not a detail. When guild resolution ran
first, an anonymous caller could tell a real guild (`401`) from an unknown one
(`404`) and enumerate every server the bot is in without logging in. Any router
mounting the shared stack gets the correct sequence by construction — these
guards were previously closures inside one route file, which is exactly how a
second router once shipped with no authentication at all.

### Fails closed

Authentication is **on by default**. With no session, every `/api/*` route
returns `401` — there is no configuration in which forgetting a variable opens
the dashboard.

The single exception is `DASHBOARD_AUTH=false`, which permits anonymous access
**only from `127.0.0.1`**, prints a warning banner on boot, and is **refused
outright when `NODE_ENV=production`**. Requests arriving through a proxy or
tunnel carry forwarding headers and are always rejected, so publishing the
dashboard cannot accidentally expose it.

### Also enforced

- **CSRF** — origin/referer check on every unsafe method (`backend/src/middleware/csrf.js`).
  `SameSite=lax` alone is not treated as sufficient.
- **OAuth `state`** — 32 random bytes per login, compared in constant time,
  single-use. Prevents login CSRF.
- **Session regeneration** on login, preventing session fixation.
- **Rate limits** — global (400 req/min/IP) plus per-user buckets on expensive
  operations (`backend/src/middleware/rate-limit.js`):

  | Bucket | Limit | Applies to |
  | :--- | :--- | :--- |
  | `bulk-moderation` | 3 / 5 min | mass kicks, bulk warning deletes, gate lock |
  | `bot-messaging` | 20 / min | anything that makes the bot post |
  | `heavy-read` | 10 / min | full-config export |
  | `restore` | 3 / 10 min | bulk state replacement |

- **Bounded bulk actions** — mass kicks are capped per call and hierarchy-checked,
  so one sweep cannot exhaust the bot's global Discord rate-limit budget.
- **Body limits** — JSON capped at 100 kB; oversized ⇒ `413`, malformed ⇒ `400`.
- **Privacy** — confessions and anonymous suggestions have author identity
  stripped below Moderator. Anonymity promised in Discord is honoured in the API.
- **Atomic economy writes** — `database/lock.js` serialises read-modify-write
  sequences per key, preventing points duplication under concurrency.
- **Sanitised errors** — `backend/src/middleware/errors.js` classifies every failure. Clients
  get an actionable message or a generic one plus a `requestId`; the stack trace
  and original message stay in the log. Raw `err.message` used to be returned
  verbatim, which leaked absolute filesystem paths from `fs` errors.
- **Contained event failures** — every Discord event is dispatched through an
  error boundary, so one throwing handler cannot silently drop an event or take
  the process down.

### Production requirements

With `NODE_ENV=production`, `DASHBOARD_AUTH=false` is refused and cookies are
forced `Secure`. Set an independent `SESSION_SECRET` for session signing. If it
is accidentally omitted but `DATABASE_URL` is configured, the server remains
online and derives a stable domain-separated key from the database URI; if both
are missing it uses an ephemeral key and disables reliable OAuth persistence.

> **Before going live:** set `NODE_ENV=production`, a strong `SESSION_SECRET`,
> and `OWNER_ID`. Run `npm test`. If a bot token was ever used with an older,
> unauthenticated build, rotate it in the Discord Developer Portal.

---

## Configuration

Copy `.env.example` to `.env`. Never commit `.env` — it is gitignored.

### Required

| Variable | Purpose |
| :--- | :--- |
| `DISCORD_TOKEN` | Bot token from the Developer Portal |
| `CLIENT_ID` | Application ID |
| `DATABASE_URL` | Supabase PostgreSQL Session Pooler connection URI |

### Required for dashboard login

| Variable | Purpose |
| :--- | :--- |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret. **Without it nobody can sign in** |
| `DISCORD_REDIRECT_URI` | Must match a Redirect URI in the portal *exactly* |
| `SESSION_SECRET` | Session signing key. Mandatory in production |

### Recommended

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | — | `production` enables fail-safe startup checks |
| `OWNER_ID` | — | Your Discord user ID; grants Admin and enables owner notices |
| `DEV_TOKEN` | — | Unlocks `/api/dev` and the Developer page (32+ random chars) |
| `DASHBOARD_URL` | — | Public URL; also pins the Socket.IO CORS origin |

### Optional

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DASHBOARD_PORT` | `3000` | HTTP port |
| `DASHBOARD_AUTH` | enforced | `false` = localhost-only bypass; blocked in production |
| `DASHBOARD_SECURE` | `auto` | `true` forces the `Secure` cookie flag |
| `DASHBOARD_ORIGIN` | — | Extra trusted origin for the CSRF check |
| `GUILD_ID` | — | Deploy commands to one guild (instant, vs ~1 h globally) |
| `DEPLOY_COMMANDS` | `false` | Register slash commands on boot |
| `SYNC_GLOBAL_COMMANDS` | `false` | Sync the global command list on boot |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `SUPPORT_INVITE` | — | Support server invite shown in `/help` |

### Discord Developer Portal setup

1. **Bot → Privileged Gateway Intents** — enable **Server Members**,
   **Message Content** and **Presence**. The bot will not start without them.
2. **OAuth2 → Redirects** — add your `DISCORD_REDIRECT_URI` verbatim.
3. **Invite** with `bot` + `applications.commands`, and permissions covering
   the features you use (Ban, Kick, Moderate Members, Manage Roles, Manage
   Channels, Connect/Speak for music).
4. Place the **bot's role above** any role it must assign or moderate — Discord's
   hierarchy applies to bots too.

---

## Dashboard

A React 19 + Vite SPA served by the Express API on the same origin.

### Permission levels

Assign Discord roles to levels under **Permissions**. The server owner and any
member with Discord's *Administrator* permission always have Admin.

| Level | Name | Access |
| :--- | :--- | :--- |
| 0 | **Viewer** | Read-only: overview, stats, member list |
| 1 | **DJ** | Viewer + music controls |
| 2 | **Moderator** | DJ + member actions, automod, logging, giveaways, identities in anonymous content |
| 3 | **Admin** | Full access: security, settings, permissions, backup/restore |

### Pages

Overview · Analytics · Members · Moderation · Security · AutoResponder ·
Progression · Leaderboard · Giveaways · Polls · Suggestions · Confessions ·
Tags · Tickets · Verification · Reaction Roles · Birthdays · Staff Board ·
Welcome · Embed Builder · Music Controller · Live Feed · Logs · Commands ·
Permissions · Server Settings · Bot Controls · Developer

### Rebuilding the client

```bash
npm run build:dashboard     # outputs to dashboard/public/
```

`dashboard/public/` holds the built SPA — do not hand-edit the hashed assets.

---

## Commands

100 slash commands across twelve categories. Run `/help` for a browsable menu.

| Category | Commands |
| :--- | :--- |
| 🛡️ **Moderation** | `ban` `softban` `kick` `timeout` `warn` `note` `role` `lockdown` `snipe` `announce` `say` `move` |
| 🤖 **AutoMod** | `automod` `whitelist` `lock` `unlock` `slowmode` |
| 🛠️ **Utility** | `ping` `help` `avatar` `userinfo` `roleinfo` `channelinfo` `define` `math` `qr` `afk` `remind` `tag` `tools` |
| 🎵 **Music** | `play` `skip` `stop` `pause` `resume` `queue` `seek` `nowplaying` `volume` `shuffle` `loop` `autoplay` `lyrics` `filters` |
| 🎲 **Fun & games** | `fun` `games` `coinflip` `roll` `ship` `wouldyourather` `truthordare` |
| 🎫 **Tickets** | `ticket` (`setup` `panel` `add` `remove` `close` `claim` `rename` `list` `transcript`) |
| ✅ **Verification** | `setupverification` |
| 🎭 **Roles** | `reactionrole` |
| 🎂 **Birthdays** | `birthday` `birthdaysettings` |
| 📜 **Logging** | `logging` |
| 🏆 **Engagement** | `rank` `leaderboard` `giveaway` `daily` `work` `pay` `points` `rep` `streak` |
| 💬 **Community** | `suggest` `poll` `confess` `credits` `invites` `serverstats` `membercount` |

All privileged commands declare `setDefaultMemberPermissions` **and** re-check
permissions at execution time, so tightening Discord's command-permission UI
cannot be used to bypass them.

---

## Testing

```bash
npm test              # command loader + 9 security suites (137 assertions)
npm run test:security # security suites only
npm run lint          # ESLint across bot, API and client
npm run lint:gate     # CI gate — fails if lint problems increase
npm run verify        # everything CI runs: lint gate + tests + dashboard build
```

`.github/workflows/ci.yml` runs the same gates on every push and pull request:
Node 22.12 setup, clean installs, native-module rebuild, zero-tolerance lint,
the full suite, the dashboard build, and checks that the committed
`dashboard/public` bundle and preserved database remain unchanged. No secrets are
required — the suites mock Discord.

| Suite | Assertions | Covers |
| :--- | ---: | :--- |
| `auth.test.js` | 20 | Fail-closed auth, loopback bypass, forged proxy headers, health minimisation |
| `audit-sweep.test.js` | 11 | Sweeps all 151 routes: none ungated, no existence oracle, no side effects |
| `resilience.test.js` | 19 | Event-handler error boundary, non-Error rejections, fatal-exception exit |
| `errors.test.js` | 19 | Error classification, no path/internal leakage, correlation ids |
| `isolation.test.js` | 18 | Cross-guild access, backup/restore scoping, CSRF |
| `hierarchy.test.js` | 16 | Role hierarchy on moderation and role assignment, anonymity redaction |
| `oauth.test.js` | 13 | OAuth `state`, replay, session hygiene |
| `abuse.test.js` | 10 | Bulk-kick cap, hierarchy in sweeps, per-endpoint rate limits |
| `concurrency.test.js` | 11 | Points double-spend, giveaway double-draw, lock semantics |

The suites run the real Express stack against a mocked Discord client — no
token or live guild required. They assert **both** that a request is rejected
**and** that no side effect occurred: a `403` is not a pass if the privileged
action already happened. Several suites first demonstrate the vulnerability
against the unfixed implementation, so they cannot pass vacuously.

**Run `npm test` before any deploy that touches the dashboard.** Every suite
exits non-zero on failure, so it can gate CI.

`npm run lint:gate` is locked to a zero-error, zero-warning baseline in
`.lintbaseline.json`. Any new lint finding fails local verification and CI.

---

## Deployment

```bash
NODE_ENV=production \
SESSION_SECRET=<32+ random bytes> \
DISCORD_TOKEN=... CLIENT_ID=... DISCORD_CLIENT_SECRET=... \
npm start
```

The bot and dashboard run in one process; `npm start` launches both.

### Public tunnel (optional)

```bash
bash scripts/keep-tunnel.sh
```

Opens a Cloudflare quick tunnel to the local dashboard, keeps it alive, and
rotates the hostname when Cloudflare drops it. Traffic arrives through the same
Express stack, so **authentication applies identically** to tunnelled requests —
the localhost bypass is unreachable from outside.

If `OWNER_ID` is set you receive a DM when the public URL changes. With no
`OWNER_ID`, no notification is sent to anyone.

### Data

All bot state and OAuth sessions live in Supabase PostgreSQL through `DATABASE_URL`.
The application creates the `bot_kv` and `dashboard_sessions` tables automatically.
Use Supabase backups for guild configuration, XP, warnings, tickets and sessions.
For Render, use Supabase's **Session Pooler** connection URI so the service can
connect over IPv4. Row Level Security is enabled with no browser policies, so
Supabase anon/authenticated API keys cannot read bot data or OAuth sessions.

To import an existing quick.db file, validate it first and then run the
idempotent transaction-based migration:

```bash
npm run migrate:sqlite -- --source database/json.sqlite --dry-run
DATABASE_URL='postgresql://...' npm run migrate:sqlite -- --source database/json.sqlite
```

The source SQLite file is opened read-only and retained as a backup. Existing
PostgreSQL keys are updated, so the command is safe to rerun.

---

## Architecture

```
EB-Bot/
├── bot/
│   └── src/
│       ├── index.js              # process entry, Discord client and command loader
│       ├── scheduler.js          # scheduled-job runner
│       ├── commands/             # 100 slash commands
│       └── events/               # gateway and player events
├── backend/
│   └── src/
│       ├── server.js             # Express 5 API; receives the live bot client
│       ├── routes/               # auth, guild, music, stats, permissions, dev
│       ├── middleware/           # auth, guild isolation, CSRF, errors, permissions
│       ├── websocket/            # authenticated Socket.IO rooms
│       └── utils/                # backend-only SSE helper
├── dashboard/                    # the single React/Vite frontend
│   ├── src/                      # pages, components and browser API/socket clients
│   ├── static/                   # source assets copied by Vite
│   └── public/                   # generated production bundle
├── database/
│   ├── index.js                  # Supabase PostgreSQL JSONB adapter
│   └── lock.js                   # per-key serialisation
├── shared/
│   ├── services/                 # bot/API domain services
│   ├── utils/                    # Discord and rendering helpers
│   └── lib/logger.js             # rotating, injection-safe logger
├── config/bot.json
├── tests/                        # unit, security and manual suites
├── scripts/                      # maintenance and tunnel tooling
├── docs/                         # architecture/audit/engineering records
└── package.json                  # one runtime process; no duplicate frontend
```

**Stack:** discord.js 14 · discord-player 7 · Supabase PostgreSQL (`pg`) ·
Express 5 · Socket.IO 4 · React 19 · Vite 8 · Tailwind

---

## Troubleshooting

**Bot starts but commands don't appear**
Set `DEPLOY_COMMANDS=true` once, or run `npm run deploy`. Global commands take
up to an hour to propagate; set `GUILD_ID` for instant registration while testing.

**Database connection failed**
Set `DATABASE_URL` to the Supabase **Session Pooler** URI, including the database
password. Render may not reach Supabase's direct IPv6-only connection. The app
creates its tables automatically after connecting.

**`EBADENGINE` on install**
Use Node 22.12 LTS. Both `package.json` and `.node-version` pin this runtime for Render.

**Dashboard login does nothing / redirect mismatch**
`DISCORD_CLIENT_SECRET` is unset, or `DISCORD_REDIRECT_URI` does not match the
Developer Portal byte for byte (scheme, host, port, path). The error page shows
the exact URI to register.

**Everything returns `401`**
Working as designed — the dashboard fails closed. Sign in via Discord OAuth. For
local development only, `DASHBOARD_AUTH=false` allows anonymous access from
`127.0.0.1`.

**`403 CSRF_ORIGIN`**
The request's `Origin` is not trusted. Set `DASHBOARD_URL` to the URL you
actually browse to, or add `DASHBOARD_ORIGIN`.

**`429` on moderation actions**
A per-operation rate limit was hit. The `Retry-After` header gives the wait in
seconds. See the bucket table under [Security model](#security-model).

**Bot can't ban / assign a role**
Discord hierarchy: move the bot's role above the target's highest role. The
dashboard reports this as a `HIERARCHY` error rather than failing silently.

**Sessions reset on every restart**
`SESSION_SECRET` is unset, so a random one is generated per process.

---

## License

MIT
