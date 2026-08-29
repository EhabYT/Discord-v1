# EB Bot V2 — Deployment and Live Acceptance Runbook

Date: 2026-08-23  
Target: `https://discord-v1-jrip.onrender.com`

## 1. Safety rules

1. Never paste credentials into Git, issues, CI logs, chat, screenshots, or smoke
   reports.
2. Every credential previously exposed outside its provider is compromised and
   must be revoked, not reused.
3. Configure secrets directly in Render's Environment panel.
4. Do not place quotes, Markdown, placeholders, or explanatory text inside
   Render secret values.
5. Do not enable automatic command deployment during routine startup unless a
   command-schema release explicitly requires it.
6. Deploy one revision, observe it, and accept or roll it back before beginning
   another production change.

## 2. Current live baseline

The sanitized preflight report is:

```text
docs/deployment/live-preflight-2026-08-23.json
```

At the time of capture, liveness and the old Dashboard worked, but the live
service was not the current V2 revision:

```text
/api/health       200
/api/v2/status    404
/api/v2/ready     404
botOnline         false
databaseOnline    false
oauthEnabled      false
```

Do not treat HTTP 200 from `/api/health` as release acceptance. It proves only
that the web process is alive.

## 3. Required provider preparation

### 3.1 Rotate credentials

Create newly rotated values at their authoritative providers:

- Discord bot token
- Discord OAuth client secret
- Supabase database password
- Supabase secret/service key if it was exposed
- Google client secret if still used elsewhere
- independent 32+ character Developer Control Center token
- Render session secret (generate a new value)

The Developer token must not be copied from any Discord credential.

### 3.2 Supabase

Use a raw Session Pooler URI:

```text
postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@HOST.pooler.supabase.com:5432/postgres
```

Requirements:

- starts with `postgresql://`;
- includes the full pooler hostname;
- password is URL-encoded;
- uses the current rotated database password;
- contains no brackets or placeholder text;
- is entered as the raw Render value, without quotes.

### 3.3 Discord Developer Portal

The OAuth redirect must be exactly:

```text
https://discord-v1-jrip.onrender.com/api/auth/discord/callback
```

Confirm the application ID belongs to the same application as the new bot token
and OAuth secret.

### 3.4 Render environment contract

Non-secret values:

```text
NODE_VERSION=22.12.0
NODE_ENV=production
DASHBOARD_AUTH=true
DASHBOARD_SECURE=true
DASHBOARD_URL=https://discord-v1-jrip.onrender.com
DISCORD_REDIRECT_URI=https://discord-v1-jrip.onrender.com/api/auth/discord/callback
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
```

Secrets configured only in Render:

```text
DATABASE_URL
DISCORD_TOKEN
CLIENT_ID
DISCORD_CLIENT_SECRET
SESSION_SECRET
OWNER_ID
DEVELOPER_IDS
SUPPORT_IDS
DEV_TOKEN
```

`DEVELOPER_IDS` and `SUPPORT_IDS` are optional comma-separated Discord IDs.
`OWNER_ID` should identify the intended super administrator.

## 4. Pre-deployment gate

From a clean checkout of the exact commit to deploy:

```bash
npm ci --ignore-scripts
npm --prefix dashboard ci --ignore-scripts
npm run verify
```

Required result:

```text
release configuration: PASS
ESLint:                0 errors, 0 warnings
unit suites:           4 PASS
security suites:       22 PASS
commands:              100
HTTP routes:           159
production audits:     0 vulnerabilities
Dashboard build:       PASS
```

Confirm:

```bash
git status --short
```

returns no output.

Push the commit and wait for the GitHub Actions `Verify` workflow to pass. Do not
deploy a commit with a red, cancelled, or missing verification run.

## 5. Render deployment

1. Select the verified commit in Render.
2. Trigger **Deploy latest commit** (or the exact verified commit).
3. Confirm the build uses Node `22.12.0`.
4. Confirm the build command is only:

   ```bash
   npm ci
   ```

5. Confirm root postinstall installs the Dashboard and invokes Vite exactly once.
6. Confirm the service binds Render's injected `PORT` and reports the health
   check as healthy.
7. Inspect logs for categories, never values:
   - PostgreSQL connected
   - Dashboard active
   - Discord bot ready
   - scheduler jobs registered
   - no repeating bootstrap error loop

A Render Free service can sleep and is not suitable for a reliably persistent
Discord gateway. Use an always-on plan for production.

## 6. Contract/security preflight

The first request may wait up to three minutes for a cold Render instance:

```bash
npm run smoke:live -- \
  --url https://discord-v1-jrip.onrender.com \
  --allow-degraded \
  --expect-release 2.0.0 \
  --wake-timeout 180000 \
  --json live-preflight.json
```

This mode still requires:

- current V2 endpoints and schemas;
- expected release `2.0.0`;
- Dashboard HTML;
- same-origin JS/CSS assets;
- security headers;
- secret-free public responses;
- JSON 404 behavior;
- HTTP-to-HTTPS redirect.

It permits `503` readiness and offline Discord/database/OAuth so configuration
problems can be diagnosed without confusing them with a stale deployment.

A failed preflight is a deployment stop condition.

## 7. Strict automated acceptance

After credentials are configured and bootstrap has completed:

```bash
npm run smoke:live -- \
  --url https://discord-v1-jrip.onrender.com \
  --expect-release 2.0.0 \
  --wake-timeout 180000 \
  --json live-acceptance.json
```

Required result:

```text
/api/health:          200
/api/v2/status:       200, status=ready
/api/v2/ready:        200, status=ready
dashboardBuilt:       true
databaseOnline:       true
discordConfigured:    true
oauthConfigured:      true
botOnline:            true
oauthEnabled:         true
failed checks:        0
```

The generated report is mode `0600`, sanitized, and contains selected public
booleans/statuses only. It does not retain response bodies, cookies, auth
headers, or environment values.

## 8. Manual acceptance

Perform these checks only after strict automation passes:

### Dashboard and OAuth

1. Open the deployment root over HTTPS.
2. Start Discord login.
3. Confirm Discord shows the intended application name.
4. Complete login and confirm redirect returns to the exact Render origin.
5. Confirm only guilds available to the signed-in user are listed.
6. Confirm a manually entered inaccessible guild URL is rejected.
7. Log out and verify the session is invalidated.

### Permissions and system roles

1. Viewer can read but cannot moderate.
2. DJ can use intended music controls only.
3. Moderator actions respect Discord role hierarchy.
4. Admin cannot act on the server owner or roles above the actor/bot.
5. Ordinary guild admins cannot access Developer Control Center APIs.
6. SUPPORT is read-only.
7. DEVELOPER requires the independent second factor.
8. Only SUPER_ADMIN can mutate feature flags, scheduler state, or deploy
   commands.

### Discord bot

In a dedicated test guild:

1. `/ping` responds once.
2. `/help` lists the expected command surface.
3. one harmless points/work operation persists after a process restart;
4. a small test giveaway can start and end exactly once;
5. a moderation dry run respects hierarchy;
6. a ticket can open and close;
7. music is tested only if the voice dependency/runtime is available.

Do not test destructive bulk actions in a production guild.

### Realtime and maintenance

1. Socket.IO/SSE events remain guild-scoped.
2. Maintenance mode returns backend `503` for ordinary APIs.
3. `/api/health`, V2 diagnostics, OAuth, and authorized Developer diagnostics
   remain reachable during maintenance.
4. Disable maintenance and rerun strict smoke acceptance.

## 9. Command deployment

Deploy slash-command definitions only when command schemas changed. Prefer the
role-protected Developer Control Center action with explicit SUPER_ADMIN
confirmation, or run the deployment command in a secured operator environment.

After command deployment:

- verify all 100 commands load;
- allow Discord propagation time for global deployment;
- test one harmless command;
- do not log the Discord token.

## 10. Rollback criteria

Rollback immediately if any of the following occurs:

- `/api/health` cannot stabilize;
- V2 endpoints return 404 or the wrong release;
- strict readiness remains 503 after provider configuration is verified;
- repeated Discord login/bootstrap loops occur;
- database authentication or DNS failures persist;
- OAuth redirects to an unexpected origin;
- security headers disappear;
- cross-guild data becomes observable;
- command handling duplicates responses;
- error rate or memory grows continuously after deployment.

## 11. Rollback procedure

1. Enable maintenance mode if authenticated control is still available.
2. In Render, redeploy the last commit with a recorded green strict acceptance.
3. Do not restore old compromised credentials; keep rotated values.
4. Wait for `/api/health` and then run the preflight against the rollback.
5. Run strict acceptance.
6. Disable maintenance only after strict acceptance passes.
7. Record the failed commit, timestamps, sanitized errors/request IDs, and
   rollback commit.
8. If a database migration was involved, follow its dedicated rollback plan;
   never overwrite Supabase with an unverified SQLite snapshot.

## 12. Post-deployment monitoring

For the first 30 minutes monitor:

- `/api/v2/ready` remains 200;
- Discord gateway remains ready;
- database connection retries remain zero/low;
- HTTP `5xx`, `401`, `403`, and `429` rates are explainable;
- P95 latency and event-loop delay stabilize;
- scheduler jobs do not accumulate failures;
- memory does not trend upward without bound.

Repeat strict smoke acceptance after 5 and 30 minutes.

## 13. Known operational limitations

- Developer audit and ordinary logs remain ephemeral files on Render.
- Metrics remain process-local.
- A durable outbox/idempotency design for Discord side effects is not yet
  implemented.
- Real provider acceptance cannot be completed without newly rotated secrets.
- Render Free sleep conflicts with an always-connected Discord gateway.
