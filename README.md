# EB Bot

Discord.js v14 bot — moderation, music, XP, tickets, and a React dashboard.

**Version:** 3.1.0 · **Slash commands:** 100 (Discord limit)

## Layout

```
discord-bot/
  index.js                 # bot entry
  scheduler.js             # job runner
  utils_logger.js          # file logger (stays here — logDir = ./logs)
  config.json
  .env                     # secrets (never commit)
  commands/                # 100 slash commands
  events/                  # Discord + player events
  utils/                   # tickets, verification, reaction_roles, cards
  scripts/                 # keep-tunnel, tests
  logs/                    # runtime logs + dead-hosts.txt
  dashboard/
    server.js              # Express API (0.0.0.0:3000)
    routes/                # guilds, music, auth, dev
    client/src/pages/      # Homepage, Verification, Reaction Roles, desk
    public/                # built SPA (do not edit hashed assets)
```

## Run

```bash
cd discord-bot
cp .env.example .env   # fill DISCORD_TOKEN + CLIENT_ID
npm install --omit=dev --ignore-scripts
npm rebuild better-sqlite3
npm start
```

Dashboard client rebuild:

```bash
npm run build:dashboard
```

Public tunnel (optional): `bash scripts/keep-tunnel.sh`

## Env

| Variable | Purpose |
| :--- | :--- |
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application ID |
| `OWNER_ID` | Developer / maintenance bypass |
| `DEV_TOKEN` | Unlock `/api/dev` + Developer page |
| `GUILD_ID` | Optional guild deploy target |
| `DEPLOY_COMMANDS` | Register slash commands on boot |
| `DASHBOARD_PORT` | Default `3000` |
| `DASHBOARD_URL` | Public dashboard URL |
| `SESSION_SECRET` | Session signing secret |
| `DASHBOARD_AUTH` | `true` = require Discord OAuth on writes |

## Commands

| Category | Examples |
| :--- | :--- |
| Moderation | `/ban` `/kick` `/warn` `/timeout` `/automod` |
| Music | `/play` `/skip` `/queue` `/lyrics` |
| Fun / games / tools | `/fun` `/games` `/tools` |
| Support | `/ticket` (`setup` `panel` `claim` `transcript`) |
| General | `/help` `/ping` `/rank` `/giveaway` |

Homepage: `/` or `#home` · Desk: `#overview` · Verification: `#verification` · Roles: `#reactionroles` · Birthdays: `#birthdays` · Developer: `#developer`

## Stack

discord.js 14 · discord-player 7 · quick.db + better-sqlite3 · Express 5 · React 19 · Vite 8

## License

MIT
