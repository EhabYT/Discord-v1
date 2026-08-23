# Phase 4 Optimization — PostgreSQL Transaction and Advisory Locks

Date: 2026-08-23  
Status: **Implemented and verified**

## Objective

Make critical points-economy and giveaway read-modify-write operations safe
across multiple Node.js instances, while preserving commands, HTTP APIs,
database keys, response payloads, permissions, and UI behavior.

The required baseline was captured and committed before production changes:

```text
docs/phase4-transaction-lock-manifest.md
commit d1488a7
```

## Previous limitation

`database/lock.js` serialized callers with a process-local Promise-chain map.
That prevents races inside one process but cannot coordinate two Render
instances sharing Supabase PostgreSQL.

A second instance could therefore:

- pass the same `/pay` balance check and duplicate points;
- overwrite a concurrent slots/work/moderator points update;
- grant a second cooldown-gated work reward;
- lose a giveaway create/delete/finalize/reroll update;
- draw or announce the same giveaway more than once under a race.

## New locking model

The public helpers remain:

```js
withKeyLock(key, callback, database)
withKeyLocks(keys, callback, database)
```

They now combine two layers:

```text
Layer 1: sorted process-local Promise queues
Layer 2: PostgreSQL transaction-scoped advisory locks
```

For PostgreSQL, every protected operation now performs:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended($1, 0));
-- one statement per sorted, deduplicated logical key
-- callback reads/writes through this same client
COMMIT;
```

On failure:

```sql
ROLLBACK;
```

The dedicated pool client is always released. Transaction-scoped locks also
release automatically on commit, rollback, or connection loss.

## Transaction-bound database adapter

The lock callback receives `lockedDb`. For PostgreSQL this adapter is bound to
the same dedicated pool client that owns the transaction and advisory locks:

```js
await withKeyLocks(keys, async (lockedDb) => {
    const value = await lockedDb.get(key);
    await lockedDb.set(key, nextValue);
}, db);
```

This is essential. Acquiring an advisory lock on one connection while issuing
reads/writes through the shared pool could execute those statements on other
connections and would not make the operation transactional.

The in-memory adapter invokes the same callback contract without requiring
credentials. Existing callbacks that ignore the new argument remain compatible.

## Protected economy operations

```text
/pay transfer                sender + recipient points
/slots wager/result          user points
/work cooldown and reward    cooldown + user points
/points adjustment           user points
/points reset                user points
```

Multi-key operations sort and deduplicate keys before both local and PostgreSQL
acquisition, preventing inconsistent lock ordering.

## Protected giveaway mutations

All operations serialize on:

```text
giveaways_<guildId>
```

Protected paths:

```text
Scheduler automatic finalization
Dashboard create
Dashboard manual end
Dashboard reroll
Dashboard delete
Discord /giveaway start
Discord /giveaway end
Discord /giveaway reroll
Discord /giveaway delete
```

Read-only overview/list/info paths remain unchanged and do not take write locks.

## Regression coverage

### PostgreSQL adapter tests

Tests verify:

- advisory keys are sorted and deduplicated;
- `BEGIN` precedes lock acquisition and callback work;
- callback reads/writes use the dedicated client;
- successful callbacks commit and return their value;
- failed callbacks preserve the original error;
- failed callbacks roll back;
- clients release after both commit and rollback.

### Concurrency tests

The existing race demonstrations still prove:

```text
Unlocked double spend: 100 starting points → 200 total points
Locked double spend:   100 starting points → 100 total points
```

They also verify:

- exactly one racing full-balance payment succeeds;
- ten concurrent increments all land;
- independent keys remain concurrent;
- concurrent giveaway finalizations lose no update;
- a failed holder does not wedge its queue;
- the local lock map drains to zero.

### New transaction-lock contract suite

Added:

```text
tests/security/transaction-locks.test.js
```

It verifies the transaction adapter contract and statically guards all critical
economy/giveaway source paths against reverting to direct shared-database writes.

## API and behavior invariance

```text
Discord commands before: 100
Discord commands after:  100
Guild HTTP routes before: 105
Guild HTTP routes after:  105
Complete HTTP inventory:  159
Database schema changes:     0
Database key migrations:     0
Frontend source changes:      0
Dependency changes:           0
```

No command names, permission requirements, HTTP methods/paths, success/error
payloads, or stored JSON formats were intentionally changed.

## Complete verification

Command:

```bash
npm run verify
```

Result:

```text
Exit code:                          0
ESLint errors:                      0
ESLint warnings:                    0
Discord commands loaded:          100
Unit suites:                     PASS
Security suites:              21 PASS
Audited HTTP routes:               159
Concurrency checks:              PASS
Transaction-lock checks:          PASS
PostgreSQL adapter checks:        PASS
Root production vulnerabilities:    0
Dashboard production vulns:          0
Dashboard modules transformed:    1,806
Dashboard build:                  PASS
Main JS bundle:                259.55 kB (81.65 kB gzip)
Main CSS bundle:                66.06 kB (12.49 kB gzip)
Build duration:                    1.33 s
```

Expected credential warnings and deliberate scheduler/error-handler failures
were emitted by tests. They are exercised failure paths, not verification
failures.

## Environment limitation

The SQL lifecycle and dedicated-client behavior are covered with the PostgreSQL
adapter test double. A real Supabase multi-replica stress test was not run
because no securely supplied, newly rotated production credentials are
available. Previously exposed credentials must not be reused.

## Deferred

- extending transactional conversion to unrelated XP/streak/reminder paths;
- redesigning Discord side effects as durable outbox/idempotency workflows;
- persistent Developer Audit storage;
- further guild-router decomposition;
- generated Dashboard asset policy;
- major dependency migrations.
