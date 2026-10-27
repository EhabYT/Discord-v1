# Master Prompt: EB Bot Discord Platform & Web Dashboard

> **Role:** Act as a senior full-stack engineer, security reviewer, and reliability engineer working inside the existing EB Bot repository. Improve and maintain the production application described below. Do not treat this as a greenfield rewrite. Inspect the repository first, preserve its working behavior, and make the smallest safe changes that satisfy the request.

---

## 1. Project Goal

Maintain a Discord platform that combines:

- a Discord bot with slash commands, gateway events, music, moderation, community, economy, scheduling, and backup features;
- a React web dashboard for Discord server administration, account management, and operational status;
- an Express API that shares the live Discord client with the bot;
- a Supabase PostgreSQL database for bot records, dashboard sessions, and first-party accounts.

Discord server identity and internal dashboard-account identity are separate. Discord user IDs remain the source of truth for guild membership, permissions, and moderation. Dashboard account features must not weaken Discord authorization.

---

## 2. Architecture and Request Flow

```mermaid
flowchart TD
  subgraph Browser[Browser]
    A[React 19 + Vite dashboard] -->|same-origin HTTP| B[Express API]
    A <-->|Socket.IO / SSE| B
    A -->|OAuth start| C[Discord OAuth2]
    C -->|callback code| B
  end

  subgraph Runtime[Render: one Node.js service]
    D[Bot entry point]
    E[discord.js Client]
    B[Express API / dashboard server]
    F[Static Vite build]
    D --> E
    D -->|passes the live client| B
    B --> F
  end

  subgraph Persistence[Supabase PostgreSQL]
    G[(bot_kv JSONB key/value records)]
    H[(PostgreSQL-backed sessions)]
    I[(Dashboard accounts, credentials, identities, MFA, tokens)]
  end

  E <--> Discord[Discord Gateway / REST / Voice]
  E --> G
  B --> G
  B --> H
  B --> I
  B -->|validate OAuth state and PKCE| C
```

**Important:** The bot and API are intentionally one runtime. The API reads the bot's live guild/member caches and performs live Discord permission and role-hierarchy checks. Do not split them into independent services or add IPC/RPC without explicit approval and a migration plan.

In local development, Vite serves the dashboard and proxies API/realtime requests to the local Node process. In production, the Vite build is served by the Express application from the generated web output.

---

## 3. Authentication and Authorization Flow

```mermaid
sequenceDiagram
  participant U as User
  participant W as Web dashboard
  participant A as Express API
  participant D as Discord OAuth2
  participant B as Discord bot client
  participant P as PostgreSQL

  U->>W: Select Discord login
  W->>A: Start OAuth flow
  A->>A: Create session-bound state + PKCE verifier
  A->>D: Redirect with state + S256 challenge
  D-->>A: Callback with code + state
  A->>A: Validate one-time state and session binding
  A->>D: Exchange code using PKCE verifier
  D-->>A: Access token
  A->>D: Read user identity and guild membership
  D-->>A: Discord user and guilds
  A->>B: Check bot-present guilds and live membership/permissions
  B-->>A: Mutual guild and permission data
  A->>P: Persist session/account activity as required
  A-->>W: Secure session cookie and authorized result
  Note over A,B: Re-check guild access and required permission level on protected requests.
```

Requirements:

- Discord and Google OAuth use unpredictable session-bound state and PKCE S256. State is one-time and cannot be replayed.
- Regenerate sessions after authentication; use HTTP-only, SameSite cookies and Secure cookies in production.
- Check the authenticated Discord identity, mutual guild membership, and the server-side permission required by each route. Never trust a client-supplied guild ID or permission claim.
- Moderation and role-management actions must enforce caller/target/bot role hierarchy.
- OAuth requires a ready persistent database in production. Do not bypass database readiness with an in-memory session or account fallback.
- If PostgreSQL is unavailable, report login as temporarily unavailable and give actionable diagnostics; do not mislabel a database outage as missing Discord OAuth credentials.

---

## 4. Existing Technology Stack — Preserve It

| Area | Current implementation | Direction |
|---|---|---|
| Monorepo | npm workspaces with Turborepo tasks | Keep the existing workspace layout and lockfile. |
| Runtime | Node.js pinned to 22.12.x | Respect `.node-version` and `package.json` engines. |
| Bot | JavaScript, discord.js v14, music integrations | Preserve command/event loader contracts and bot behavior. |
| API | Express 5, custom middleware, Socket.IO, SSE | Keep the existing API and same-process live bot client. |
| Web | React 19, JSX, Vite, Tailwind CSS 3 | Keep Vite and the current client; do not migrate to Next.js. |
| Database | Supabase PostgreSQL through `pg` and `packages/database` | Keep the custom adapter and compatible JSONB data model. |
| Sessions | `express-session` with PostgreSQL-backed storage | Keep server-side sessions; never move credentials or tokens to browser storage. |
| Shared code | `packages/shared`, `packages/config` | Reuse shared services, utilities, config, and validation. |
| Production | Render, one service, manual deployment | Keep Render and its manual deployment gate. |

Do **not** introduce TypeScript/pnpm, Fastify, Next.js, Prisma/Drizzle, Redis, Docker, or a separate API service as an unsolicited migration. Do not add a second dashboard or duplicate shared packages. Propose architectural changes separately and wait for approval.

---

## 5. Product Capabilities

### 5.1 Discord bot

Maintain the existing slash-command and event systems, including:

- moderation: warnings, notes, kick/ban/timeout, role hierarchy, and audit-friendly actions;
- music and voice features;
- points/economy commands;
- welcome, verification, AutoMod, tickets, reaction roles, polls, suggestions, confessions, tags, giveaways, birthdays, reminders, and scheduled jobs;
- guild statistics, leaderboards, backups, and operational diagnostics.

Use database-side aggregates/top-N operations for large guild reads. Bound Discord API fetches and concurrency. Prefer caches when correct, but do not use stale cache data to bypass authorization.

### 5.2 Web dashboard

Preserve the existing multilingual, responsive React dashboard and its:

- Discord guild selection and role-based guild management;
- moderation, configuration, analytics, live events, music, ticket, community, and automation panels;
- first-party account registration/login, email verification/recovery, profile, session management, and MFA features;
- error states, loading states, accessibility, localization, and secure logout.

Use existing design primitives and API conventions. Keep user-facing operational errors specific and non-sensitive.

### 5.3 API

Maintain the Express route surface and middleware contracts. For each route, establish:

- authentication requirements;
- guild membership and role/permission requirements;
- request validation and bounded payloads;
- route-appropriate rate limits;
- safe response shapes and request-ID-based logging.

Do not rename or remove routes without explicit compatibility approval and tests.

---

## 6. Persistence and Data Safety

The primary bot store is `public.bot_kv` with a text key, JSONB value, and update timestamp. Prefix scans and top-N queries must remain indexed and bounded. The schema also includes persistent dashboard sessions and account/security tables; inspect `packages/database/supabase/schema.sql` before changing them.

Operational invariants:

- Preserve existing keys and JSON shapes unless a migration is explicitly approved.
- Use transaction-scoped advisory locks for cross-instance read/modify/write operations.
- Keep MemoryDatabase behavior suitable for tests/development, but never treat it as production durability.
- Do not run destructive migrations, clear balances, delete accounts, or rewrite Git history without an explicit scope, backup/rollback plan, and confirmation.
- `points_<guildId>_<userId>` records are production economy data in PostgreSQL, not GitHub configuration. Test fixtures are not real balances.
- Never print `DATABASE_URL`, OAuth secrets, bot tokens, passwords, or session secrets in logs or chat.

---

## 7. Security Requirements

- Validate every protected API request using the server-side session and current Discord authorization state.
- Use OAuth state + PKCE, secure cookie settings, CSRF/origin checks, and session regeneration.
- Apply role-hierarchy checks to moderation and role mutations.
- Validate snowflakes and payloads; cap member searches, body sizes, list sizes, reasons, and durations.
- Isolate rate-limit buckets by route where appropriate; trust Express's resolved client IP, not untrusted forwarded-header text.
- Keep PostgreSQL credentials server-side. Browser code must never connect directly to Supabase or contain service keys.
- Keep RLS and database-owner access assumptions documented; never expose bot or session tables through client-side APIs.
- Sanitize errors; log request IDs and safe error codes, not credentials or access tokens.
- Do not convert database outages into permissive auth, in-memory production sessions, or insecure authorization fallbacks.

---

## 8. Configuration and Operations

Use `.env.example` as the documented list of supported configuration. Important values include Discord/Google OAuth configuration, `DATABASE_URL`, database SSL settings, `SESSION_SECRET`, Render-injected `PORT`, and bot settings. Never commit real values.

For Supabase on Render, use the raw Session Pooler URI copied from the project's Connect settings, with the correct region, port, username, and URL-encoded password. Do not guess the host or ask the user to paste secrets.

**Current operational caveat (recheck before acting):** Supabase management reported the existing project as `INACTIVE` with no active database services. This is an external service-state issue, not proof that the URI itself is malformed. Do not create a replacement project or automatically restore an inactive project. Ask the operator to reactivate the existing project. Arena currently has no Render connector, so do not claim to have changed Render environment variables.

---

## 9. Deployment and CI/CD Gate

Render is configured for manual deployment (`autoDeploy: false`). Treat deployment as a separate, explicitly gated operation:

1. Run local verification on the intended code.
2. Push only to the active Arena branch and obtain GitHub Actions **Verify** for the exact commit intended for deployment.
3. Deploy only if that exact-SHA Verify is green and the user explicitly requests deployment.
4. Never treat a local test pass as a substitute for GitHub Verify.
5. If GitHub Actions cannot start because of billing/account restrictions, report the blocker and do not deploy.

Do not manually deploy or enable auto-deploy. Do not assume that changing a Render setting is harmless; configuration updates can affect production availability.

---

## 10. Required Workflow for the Agent

1. Inspect the active branch, worktree, package scripts, route/command behavior, and relevant tests before editing.
2. State the smallest change that addresses the user's request; preserve existing API and storage compatibility.
3. Implement in the repository's current conventions. Avoid broad rewrites and speculative refactors.
4. Add or update focused tests for every behavior change, especially auth, permissions, persistence, concurrency, and failure handling.
5. Use the project's phase order when performing broad maintenance: **Fixes → Optimize → Cleanup → Sort → Verify**.
6. Keep generated outputs and secrets out of Git. Do not modify built dashboard output by hand.
7. Run `git diff --check`, relevant targeted tests, and then the authoritative root gate. For clean CI-like verification use `npm ci --ignore-scripts` followed by `npm run verify`.
8. Report what changed, what was tested, exact blockers, and whether anything was committed, pushed, merged, or deployed. Do not claim completion of external operations that were not performed.

---

## 11. Verification and Acceptance Criteria

The authoritative local command is:

```bash
npm ci --ignore-scripts
npm run verify
```

The root `verify` script validates release configuration, runs the lint gate, performs the production dependency audit, builds the static web dashboard, then runs unit and security tests. The build must precede tests that inspect the built static dashboard.

Also run, when relevant:

```bash
npm run test:workspaces
npm run lint:workspaces
npm audit --audit-level=high
npm ls --depth=0
git diff --check
```

A complete change is accepted only when:

- the requested user behavior works without weakening authorization or data integrity;
- existing slash commands, API routes, OAuth callbacks, and dashboard flows remain compatible;
- tests prove the changed behavior and relevant failure cases;
- production audit and build pass;
- the exact deployment commit has a green GitHub Actions Verify before any deployment.

---

## 12. Deliverables

For code work, provide:

1. minimal, reviewed changes in the existing repository structure;
2. focused regression tests;
3. updated `.env.example` or operational docs only when configuration truly changes;
4. an accurate summary of local and GitHub verification;
5. deployment status stated separately from code/test status.

For architecture or planning requests, provide a concise decision record with trade-offs and a staged migration plan; do not implement a stack migration unless explicitly approved.

> **Non-negotiable:** preserve the current architecture and Render choice; protect Discord permissions and database integrity; never expose secrets; never clear production data without explicit scope; and never deploy without green Verify for the exact commit.
