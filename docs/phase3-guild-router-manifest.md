# Phase 3 Pre-Change Manifest — Guild Router Decomposition

Date: 2026-08-23  
Status: **Baseline captured before architectural refactoring**

## Phase boundary

Phase 3 is deliberately limited to one low-risk extraction from
`backend/src/routes/guilds.js`. It does not change database formats, Discord
commands, HTTP paths, authorization rules, response shapes, frontend behavior,
or deployment configuration.

## Baseline inventory

```text
File:                backend/src/routes/guilds.js
SHA-256:             b300cda7607d1e95ec46c1115a9ceebc846f57cec96aa6c5b825f7f2044c07d2
Size:                82,615 bytes
Lines:               1,718
HTTP routes:         105
GET:                  33
POST:                 53
DELETE:               18
PATCH:                 1
PUT:                   0
```

The complete audited API inventory remains 159 routes. The guild router is
mounted at:

```text
/api/guild/:guildId
```

Before any guild handler runs, the parent router applies:

```js
router.use(guildAccess.guildAccessStack(botClient, 0));
```

This middleware ordering is a security invariant and must remain unchanged.

## Selected extraction: read-only analytics

Only these three handlers are in scope:

```text
GET /analytics/chart
GET /analytics/commands
GET /analytics/summary
```

Reasons this is the lowest-risk first seam:

- all three handlers are read-only;
- all three already delegate to one service, `shared/services/analytics.js`;
- they perform no database writes and no Discord mutations;
- they share no private helper closures with the rest of `guilds.js`;
- they are the final contiguous route block in the file;
- they inherit the existing parent guild-access stack;
- their fallback payloads are explicit and can be contract-tested.

## Dependency manifest

Inputs used by the selected handlers:

```text
req.params.guildId
req.guild                 (summary only)
shared/services/analytics.js
res.json
next
```

They do not depend on:

```text
botClient
requirePerm
rate-limit middleware
database/index.js
database/lock.js
Discord WebhookClient/EmbedBuilder
sendToWebhook
```

## Refactoring design

Create a domain registration module under:

```text
backend/src/routes/guilds/analytics.js
```

The module will register the same three handlers on the existing parent router
at the same point in route order. This avoids introducing a second Express
router layer and preserves:

- merged `guildId` parameters;
- the already-applied authentication/guild middleware;
- handler and error propagation semantics;
- exact route paths and methods;
- route registration order.

The existing optional-service fallback behavior will remain intact.

## Required verification

Phase 3 may be marked complete only if all of the following pass:

1. A focused analytics route contract test checks methods, paths, successful
   payloads, fallback payloads, and `next(err)` behavior.
2. The audit sweep still discovers exactly 159 HTTP routes and proves every
   non-public route remains gated.
3. ESLint reports zero errors and zero warnings.
4. All unit and security suites pass.
5. Root and Dashboard production audits report zero vulnerabilities.
6. The Dashboard production build succeeds.
7. A route-manifest comparison confirms no method/path was added, removed, or
   duplicated by the extraction.

## Explicitly deferred

The following are not part of this phase:

- extracting any write-heavy or Discord-mutating guild domain;
- changing the module-level router lifecycle;
- PostgreSQL transactions or advisory locks;
- persistent audit storage;
- generated Dashboard asset policy;
- dependency major-version migrations.
