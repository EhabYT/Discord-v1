# File Organization — Phase 1 Analysis

**No files moved.** Working tree verified clean (652 commits, 0 uncommitted).

---

## 1. Current structure

```
Discord-v1/
├── index.js              bot entry — ALSO boots the API (line 131)
├── scheduler.js          job runner
├── utils_logger.js       logger
├── config.json           colours, emojis, profanity list
├── json.sqlite           live database (gitignored)
├── commands/     100 files   slash commands
├── events/        23 files   gateway + player handlers
├── utils/         25 files   services shared by bot AND api
├── dashboard/
│   ├── server.js          Express app
│   ├── socket.js          Socket.IO
│   ├── middleware/ 7      auth, guildAccess, csrf, rateLimit, errors, permissions, devauth
│   ├── routes/     6      guilds, music, auth, dev, stats, permissions
│   ├── client/    62      React 19 + Vite source
│   └── public/            build output (generated)
├── scripts/       15 files   9 test suites, lint gate, tunnel
├── docs/                  engineering-lessons.md
└── .github/workflows/     ci.yml
```

## 2. Classification (§14)

| Class | Files | Notes |
|:---|---:|:---|
| BOT | 126 | `commands/`, `events/` |
| FRONTEND | 62 | `dashboard/client/` — already isolated, own `package.json` |
| SHARED | 25 | `utils/` — used by bot **and** API |
| BACKEND | 20 | `dashboard/` minus client and public |
| TESTS/SCRIPTS | 15 | `scripts/` |
| ROOT | 12 | configs, entry points |
| RUNTIME | 7 | `logs/` (gitignored) |
| DOCS / CI | 2 | |
| **UNKNOWN** | **0** | every file classified |

## 3. The decisive finding

**Backend and bot are one process, by design — not by accident.**

`index.js:131` calls `startDashboard(client)`, passing the live Discord client into
Express. Every router is a factory taking `botClient`:

```js
module.exports = (botClient) => { … }   // all 6 routers
```

**189 references** to that client across the API layer:

| File | refs | | File | refs |
|:---|---:|---|:---|---:|
| `routes/guilds.js` | 69 | | `middleware/guildAccess.js` | 12 |
| `server.js` | 35 | | `middleware/permissions.js` | 3 |
| `routes/music.js` | 23 | | `socket.js` | 2 |
| `routes/dev.js` | 17 | | `routes/auth.js` | 4 |
| `routes/permissions.js` | 9 | | `routes/stats.js` | 7 |

These are **not HTTP calls to the bot**. They read the gateway's in-memory cache —
`botClient.guilds.cache`, `guild.members.fetch()`, `botClient.ws.ping`. The security
model depends on it: `requireGuildMember` verifies membership against
`guild.members.fetch()`, and `hierarchyError` compares live role positions.

A separate `backend/` **process** could not do this. It would need either a second
gateway connection (a second bot login — Discord rate-limits and it would double
memory) or an IPC/RPC layer between the two, inventing a distributed system where a
function call exists today.

## 4. Migration risk (§32)

| Signal | Count |
|:---|---:|
| Relative `require`/`import` statements | **377** |
| `__dirname` / `process.cwd()` constructions | **20** |
| Files containing at least one | **148** |
| **Dynamic** `require(path.join(...))` at runtime | **4 sites** |

The dynamic loaders are the real hazard — invisible to any static rename tool:

```
index.js:61          require(path.join(commandsPath, file))   ← loads all 100 commands
events/index.js:20   require(path.join(eventsDir, ...))       ← loads all 23 events
events/index.js:33   require(path.join(playerEventsDir, ...)) ← loads 9 player events
utils/startup.js:18  require(path.join(commandsPath, file))   ← command deployment
```

A broken path here does not fail at build time or in a lint run. The bot starts,
logs "Loaded 0 commands", and every slash command silently disappears.

## 5. Recommendation

**Reject the four-way `backend/ frontend/ dashboard/ bot/` split. Adopt a scoped
reorganisation instead.**

The brief permits this — §2 says "if the project needs a different structure, choose
the best logical structure", §5 says "do not create a duplicate frontend", and §33
says this task is *organize/move/rename*, **not** rewrite.

Splitting backend from bot is not a file move. It is an architectural change
requiring IPC, and §33 explicitly forbids business-logic changes here. It would also
violate §18 (one source of truth): `utils/` is genuinely shared by both, so a split
forces either duplication or a third package.

Equally, `frontend/` **and** `dashboard/` must not both exist. They are the same
React app (`dashboard/client/`), and §5 warns against exactly that duplication.

### What is genuinely worth doing

| Change | Value | Risk |
|:---|:---|:---|
| `dashboard/` → `src/api/` | Names the thing correctly: it is the HTTP API, not a UI | Low — 20 files, all internal |
| `dashboard/client/` → `web/` | Ends the "dashboard means two things" confusion | Low — self-contained, own package.json |
| `utils/` → split `services/` + `lib/` | 25 files in one folder mixes business services with helpers | Medium — 35 dependents |
| `scripts/test-*.js` → `tests/security/` | §10 asks for organised tests | Low — 9 files, referenced only in package.json |
| `utils_logger.js` → `lib/logger.js` | Root-level oddity, 24 dependents | Low |
| `docs/` subfolders | §12 | None |

### What must not move, and why

- **`commands/`, `events/`** — loaded by `readdirSync` + dynamic `require`. Moving
  them means editing the loaders, and a mistake is silent.
- **`json.sqlite`** — live data. §22 forbids touching it.
- **`dashboard/public/`** — generated. §23: change source, rebuild.
- **`config.json`** — 22 dependents.

## 6. Safe migration plan (§20)

Each stage is one commit, fully validated before the next. Any failure → stop, fix,
retest — never continue.

| Stage | Work | Validation |
|:---|:---|:---|
| 0 | Tag rollback point | `git tag pre-reorg` |
| 1 | `tests/` — move 9 suites, update `package.json` + CI | `npm test` = 137 |
| 2 | `docs/` subfolders | links resolve |
| 3 | `utils_logger.js` → `lib/logger.js` (24 dependents) | full suite |
| 4 | `dashboard/client/` → `web/` | `npm run build:dashboard`, bundle hash |
| 5 | `dashboard/` → `src/api/` (20 files, 21 path refs in server.js) | full suite + sweep |
| 6 | `utils/` → `services/` + `lib/` | full suite |
| 7 | Final audit: imports, paths, bot boot, README | everything |

After **every** stage: `npm test` (137), `npm run lint:gate`, `npm run build:dashboard`,
bundle-drift check, and `git status` clean.

## 7. Baseline to protect

```
npm test        137 assertions, 9 suites, exit 0
lint gate       20 errors / 22 warnings (budget met)
vite build      reproducible, bundle in sync
git             652 commits, tree clean
routes          151 endpoints (inventory captured for byte-diff)
```

---

## ⚠️ Unrelated but urgent

The credentials in your previous message are **still live**. I did not write them to
disk — no `.env` exists, and nothing was committed. But `DISCORD_TOKEN`,
`DISCORD_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` and `JWT_SECRET`
must be rotated regardless. Reorganising files does not reduce that exposure.

Also: `DB_PATH`, `JWT_SECRET`, `UPGRADE_MODE` and both `GOOGLE_*` variables are read
by **no file** in this project.
