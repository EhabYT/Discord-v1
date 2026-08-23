# Phase 3 Optimization — Incremental Guild Router Decomposition

Date: 2026-08-23  
Status: **Implemented and verified**

## Objective

Establish a safe decomposition pattern for the 1,718-line guild router without a
broad rewrite. Preserve every public HTTP method/path, the parent authorization
stack, middleware ordering, response payload, error path, Discord behavior, and
Dashboard behavior.

The required pre-change baseline was captured and committed first in:

```text
docs/phase3-guild-router-manifest.md
commit 2c39a33
```

No production code was changed before that manifest commit.

## Scope completed

Exactly one read-only domain was extracted:

```text
GET /analytics/chart
GET /analytics/commands
GET /analytics/summary
```

New domain module:

```text
backend/src/routes/guilds/analytics.js
```

The existing parent router now calls:

```js
registerAnalyticsRoutes(router);
```

at the same final position where the handlers were previously declared.

## Why registration was used instead of a nested router

The domain module registers directly on the existing router. It does not create
or mount a second Express router. This preserves the behavior of the original
implementation as closely as possible:

- `guildAccess.guildAccessStack(botClient, 0)` still runs before all handlers;
- `req.params.guildId` remains supplied by the existing merge-params router;
- `req.guild` remains supplied by the authoritative guild-access middleware;
- route order is unchanged;
- Express `next(err)` propagation is unchanged;
- no duplicate middleware layer is introduced.

## Functional invariance

A before/after route-manifest comparison produced:

```text
Guild routes before: 105
Guild routes after:  105
Removed:                0
Added:                  0
Duplicated:             0
```

Method totals remained:

```text
GET:     33
POST:    53
DELETE:  18
PATCH:    1
PUT:      0
```

The complete API audit still discovers exactly:

```text
159 HTTP routes
```

The three analytics contracts remain:

- chart: 24 zeroed hourly buckets when the optional analytics service is absent;
- commands: `{ commands: [], total: 0 }` fallback;
- summary: zeroed activity, online, and command totals fallback;
- service failures are passed to Express through `next(err)`.

## Focused regression coverage

Added:

```text
tests/unit/guild-analytics-routes.test.js
```

It verifies:

1. exact methods and paths;
2. route registration order;
3. successful chart/command/summary response forwarding;
4. `guildId` and `req.guild` service inputs;
5. all three fallback response shapes;
6. all three error-forwarding paths.

The test is now part of `npm run test:unit`.

The security audit route discovery was made decomposition-aware by including the
new guild domain source. Its pinned 159-route assertion prevents a route from
being silently lost or duplicated during this and future controlled
extractions.

## Size metrics

```text
Before:
  backend/src/routes/guilds.js          1,718 lines / 82,615 bytes

After:
  backend/src/routes/guilds.js          1,706 lines / 81,855 bytes
  backend/src/routes/guilds/analytics.js   59 lines /  1,431 bytes
```

This phase optimizes ownership and review boundaries, not raw line count. The
fallback formatting was intentionally expanded in the domain module for a
clear, testable contract.

## Complete verification

Command:

```bash
npm run verify
```

Result:

```text
Exit code:                         0
ESLint errors:                     0
ESLint warnings:                   0
Discord commands loaded:         100
Focused analytics route tests:  PASS
All unit suites:                PASS
All 20 security suites:         PASS
Audited HTTP routes:              159
Root production vulnerabilities:   0
Dashboard production vulns:         0
Dashboard modules transformed:   1,806
Dashboard production build:       PASS
Main JS bundle:               259.55 kB (81.65 kB gzip)
Main CSS bundle:               66.06 kB (12.49 kB gzip)
Build duration:                   1.31 s
```

Expected test-environment warnings about absent local OAuth/database/session
credentials were emitted. Deliberate scheduler and error-handler failure cases
also logged their expected errors. They are assertions of failure handling, not
verification failures.

## Behavior intentionally unchanged

- No API endpoint was added or removed.
- No permission threshold changed.
- No middleware moved ahead of the guild authentication stack.
- No database key or query changed.
- No Discord operation changed.
- No frontend source changed.
- No dependency version changed.
- No generated Dashboard asset policy changed.

## Deferred to a future approved phase

No additional guild domain should be extracted without a new explicit phase
approval. Candidate work remains:

1. choose the next cohesive domain using a new dependency manifest;
2. add PostgreSQL transaction/advisory-lock support for multi-instance economy
   and giveaway safety;
3. persist Developer Audit outside the ephemeral Render filesystem;
4. decide the tracked generated-assets policy.
