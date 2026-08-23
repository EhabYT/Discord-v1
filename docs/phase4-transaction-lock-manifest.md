# Phase 4 Pre-Change Manifest — Transactional Economy and Giveaway Locks

Date: 2026-08-23  
Status: **Baseline captured before database/locking refactoring**

## Phase boundary

Phase 4 is limited to multi-instance correctness for points-economy and giveaway
read-modify-write operations. Public Discord command names/responses, HTTP
methods/paths/payloads, database keys/JSON shapes, permission checks, and
Dashboard behavior must remain unchanged.

## Current lock architecture

`database/lock.js` provides process-local Promise chains:

```js
withKeyLock(key, fn)
withKeyLocks(keys, fn)
```

Properties already verified:

- same-process callers using the same key serialize;
- independent keys remain concurrent;
- multiple keys are sorted to avoid local deadlock;
- failed callbacks do not poison queues;
- drained lock entries are removed.

Limitation:

```text
Render instance A process map != Render instance B process map
```

Therefore two replicas can concurrently execute the same protected
read-check-write operation against Supabase PostgreSQL. The existing local locks
are insufficient for horizontal scaling.

## Critical operation inventory

### Points economy

| Operation | Keys | Baseline protection |
|---|---|---|
| `/pay` transfer | sender + recipient points | process-local multi-key lock |
| `/slots` wager/result | user points | none |
| `/work` reward/cooldown | user points + cooldown | none |
| `/points` moderator adjustment | user points | none |
| `/points reset` | user points | none |

The `/pay` operation has the highest severity: two replicas can pass the same
balance check and duplicate value. Slots, work, and moderator adjustment can
lose concurrent updates. Work can also award a cooldown-gated reward twice.

### Giveaways

All mutations use one logical key per guild:

```text
giveaways_<guildId>
```

| Mutation path | Baseline protection |
|---|---|
| scheduler automatic finalization | process-local lock |
| Dashboard manual end | process-local lock |
| Dashboard reroll | none |
| Dashboard create | none |
| Dashboard delete | none |
| Discord `/giveaway start` | none |
| Discord `/giveaway end` | none |
| Discord `/giveaway reroll` | none |
| Discord `/giveaway delete` | none |

Concurrent full-array writes can lose additions/deletions/status changes or
award a giveaway more than once.

## Required database design

For PostgreSQL, a protected operation must:

1. acquire one dedicated pool client;
2. execute `BEGIN`;
3. acquire deterministic transaction-scoped advisory locks for sorted logical
   keys;
4. run every database read/write in the callback through that same client;
5. execute `COMMIT` on success;
6. execute `ROLLBACK` on failure;
7. always release the client.

Required lock primitive:

```sql
SELECT pg_advisory_xact_lock(hashtextextended($1, 0));
```

Hash collisions may serialize unrelated operations but cannot violate
correctness. Transaction-scoped locks automatically release on commit,
rollback, or connection loss. Sorted key acquisition prevents cross-key
ordering deadlocks.

Process-local locks remain as a compatible first layer and as the deterministic
in-memory/test implementation. Critical callbacks must receive and use the
transaction-bound database adapter; acquiring a PostgreSQL lock on one
connection while querying through the shared pool would not be safe.

## Compatibility requirements

- Existing `withKeyLock` and `withKeyLocks` exports remain available.
- Callback return values and thrown errors remain unchanged.
- Existing database methods retain signatures and response shapes.
- In-memory test operation remains credential-free.
- No database schema or stored key migration is required.
- No arbitrary SQL or user-selected lock callback is exposed to the browser.

## Required verification

1. Unit tests prove sorted/deduplicated advisory acquisition.
2. Tests prove `BEGIN` → locks → callback queries → `COMMIT` ordering.
3. Tests prove callback failure causes `ROLLBACK` and client release.
4. Tests prove all callback reads/writes use the dedicated transaction client.
5. Concurrency tests continue to prove value conservation and giveaway update
   safety.
6. Static/runtime checks cover every critical economy/giveaway mutation path.
7. Route and command inventories remain unchanged.
8. ESLint remains at zero errors and zero warnings.
9. All unit/security suites, production audits, and Dashboard build pass.

## Explicitly deferred

- transaction conversion of unrelated XP/streak/reminder features;
- changing giveaway external Discord side-effect semantics;
- persistent Developer Audit storage;
- additional guild-router decomposition;
- dependency major upgrades;
- generated Dashboard asset policy.
