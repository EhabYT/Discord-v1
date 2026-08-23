# Phase 2 Optimization — Indexed PostgreSQL Prefix Access

Date: 2026-08-23  
Status: **Implemented and verified**

## Objective

Remove production `db.all()` full-table reads where callers only require keys
with a known prefix. Preserve public HTTP responses, Discord behavior, database
key format, and migration compatibility.

## Previous cost

The compatibility adapter exposed only `all()`, so birthday, rank, warnings,
notes, tickets, XP reset, staff board, and scheduler operations transferred and
parsed every JSONB row before filtering in JavaScript.

For `N` total keys and `K` matching keys:

```text
Previous database/network work: O(N)
Previous application memory:     O(N)
Useful output:                    O(K)
```

This became increasingly expensive as unrelated guilds and features added keys.

## New database API

```js
await db.scanPrefix(prefix, { limit, cursor })
await db.allByPrefix(prefix, { pageSize, maxRows })
await db.deletePrefix(prefix)
await db.keyCount()
await db.prefixStats(limit)
```

### `scanPrefix`

- Validates prefix length and cursor ownership.
- Escapes PostgreSQL `LIKE` wildcard characters.
- Uses keyset pagination rather than offsets.
- Caps one page at 5,000 rows.
- Returns `{ rows, nextCursor }`.

### `allByPrefix`

- Collects keyset pages for compatibility call sites.
- Defaults to 1,000 rows/page.
- Refuses more than 50,000 rows instead of silently exhausting memory.

### `deletePrefix`

- Executes one bounded PostgreSQL `DELETE` for XP/stat reset.
- Returns the database row count.

### Aggregates

Developer diagnostics now use scalar/aggregate SQL:

```sql
SELECT COUNT(*) FROM bot_kv;
SELECT split_part(key, '_', 1), COUNT(*) FROM bot_kv GROUP BY 1;
```

No JSONB values are transferred for key-count diagnostics.

## Index

Added to automatic initialization, migration setup, and `supabase/schema.sql`:

```sql
CREATE INDEX IF NOT EXISTS bot_kv_key_prefix
ON bot_kv (key text_pattern_ops);
```

Queries use an escaped prefix pattern:

```sql
WHERE key LIKE $1 ESCAPE '\'
  AND ($2::text IS NULL OR key > $2)
ORDER BY key
LIMIT $3
```

This handles underscore-containing keys correctly while enabling indexed prefix
matching.

## Migrated production call sites

- `/leaderboard`
- guild warnings list
- activity warning aggregation
- birthdays API
- open tickets list
- staff notes list
- bulk warning clear
- XP/stat reset
- `/birthday list`
- `/rank`
- birthday scheduler
- birthday-role expiration
- reminder scheduler
- staff-board AFK list
- staff-board reminders
- Developer database diagnostics

## Result

```text
Production db.all() call sites before: 17
Production db.all() call sites after:   0
```

The legacy `all()` method remains for migration/backward compatibility but is no
longer used by bot/backend/shared production paths.

Expected complexity for prefix operations:

```text
Database index seek: O(log N)
Rows transferred:    O(K)
Application memory:  O(K)
```

## Functional invariance

- Existing key names remain unchanged.
- Existing JSONB values remain unchanged.
- HTTP response shapes remain unchanged.
- Discord command responses remain unchanged.
- Warning clear still preserves empty warning arrays.
- XP reset still reports the number of deleted rows.
- Scheduler behavior and rate-limit-friendly sequential Discord operations are
  unchanged.

## Verification

Tests cover:

- escaped underscore prefixes
- ordering
- keyset pagination
- cursor validation
- unrelated-key isolation
- multipage collection
- prefix deletion isolation
- database-side prefix aggregation
- scalar key count
- legacy `all()` compatibility
- economy/giveaway concurrency
- Developer API behavior
- ESLint zero-warning gate
- Dashboard production build
- root/Dashboard audits with zero vulnerabilities

## Remaining database work

1. Collect real Supabase `EXPLAIN (ANALYZE, BUFFERS)` evidence with production-like
   data after credentials are configured.
2. Consider streaming/async iteration for prefixes expected to exceed 50,000
   rows.
3. Replace process-local economy locks with PostgreSQL transactions/advisory
   locks before multi-instance deployment.
4. Add retention policies for expired reminder/birthday/audit keys.
