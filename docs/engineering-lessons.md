# Engineering Lessons

A record of defects found in this codebase, why they happened, and what now
prevents them from recurring. Each entry exists because the same class of bug
appeared more than once, or because the fix changed how we build things.

Ordered newest first.

---

## A duplicate endpoint kept leaking after its twin was fixed

### Problem
`GET /api/auth/me` returned the bot owner's real username, tag and avatar to
unauthenticated callers:

```
{"username":"RealOwner","tag":"RealOwner#0001","avatar":"https://…"}
```

### Root cause
It is a near-copy of `GET /api/me` in `server.js`. That one was gated during the
first remediation; this duplicate in `routes/auth.js` was never noticed, because
the fix was applied by reading the file that contained the known problem.

### Impact
Owner identity disclosure to anyone who could reach the dashboard — including
over the public tunnel.

### Correct fix
`requireAuth` on the route. The dashboard client only calls `/api/me`, so
nothing in the UI changed. Kept rather than deleted: it is a published endpoint
external tooling may use.

### Why the previous approach failed
Five phases of audit reviewed files. A duplicate in a *different* file is
invisible to that method — the same blind spot that let `routes/permissions.js`
ship unauthenticated.

### Prevention
`tests/security/audit-sweep.test.js` enumerates all 151 routes from source, requests
each one anonymously, and fails on any 2xx outside a documented allowlist. It
does not care which file implements a route, so a duplicate cannot hide.

### Detection
First run of the sweep flagged it immediately.

### Regression test
`audit-sweep.test.js` — verified non-vacuous by reverting the fix and watching
it fail with `GET /api/auth/me -> 200`.

### Related files
`dashboard/routes/auth.js`, `dashboard/server.js`, `tests/security/audit-sweep.test.js`

---

## A debug probe was committed

### Problem
`_probe2.js`, a throwaway script for reproducing the guild-existence oracle, was
committed during Phase 4 and survived four more phases.

### Root cause
The `rm -f` that would have removed it ran in a shell invocation that was killed
before completing. Nothing verified the working tree afterwards.

### Prevention
`.gitignore` now excludes `_*.js`, `*.bak` and `*.orig`, so scratch files cannot
be staged even by `git add -A`. Verified with `git check-ignore`.

### Detection
Listing every file changed across the audit, rather than trusting that cleanup
commands succeeded.

---

## Giveaways could be drawn twice

### Problem
The scheduler's `giveaways` job (every 10 s) and the dashboard end/reroll routes
both read `giveaways_<guild>`, mutate one entry across `await`s, then write the
whole array back. Concurrent finalisation lost one side's write, leaving a
finished giveaway still marked `active` — the scheduler then drew it again and
the prize was awarded twice.

### Symptoms
Duplicate winners; a giveaway reappearing as active after being ended.

### Root cause
Same class as the `/pay` double-spend: read-modify-write on a shared key with an
`await` in the middle. Fixing `/pay` addressed one call site, not the pattern.

### Correct fix
Both paths wrap the whole sequence in `withKeyLock('giveaways_<guildId>')`.

### Why the previous implementation failed
`utils/db_lock.js` existed and was correct, but nothing pointed at the other
call sites. A fix applied to one endpoint does not generalise on its own.

### Prevention
`require-atomic-updates` is enabled as an ESLint **error**. It flags this exact
shape, so a new instance fails the lint gate rather than waiting to be found by
inspection.

### Detection
ESLint reported 12 occurrences in `utils/giveaway_service.js` on the first run.

### Regression test
`tests/security/concurrency.test.js` — proves the race against the unlocked code first,
then asserts the locked version loses no update.

### Related files
`utils/giveaway_service.js`, `utils/scheduler_jobs.js`,
`dashboard/routes/guilds.js`, `utils/db_lock.js`

---

## A UI page crashed for larger servers only

### Problem
`Permissions.jsx` referenced `roleQuery` / `setRoleQuery`, which were never
declared. The search box renders only when a guild has more than five assignable
roles, so the page threw a ReferenceError and blanked — for exactly the servers
most likely to need it.

### Root cause
No linter. `no-undef` catches this in milliseconds; manual review had passed over
the file repeatedly because the crash is conditional on data.

### Prevention
ESLint with `no-undef` as an error, enforced by a ratcheting gate.

### Detection
First lint run flagged five references to two undeclared identifiers.

### Related files
`dashboard/client/src/pages/Permissions.jsx`, `eslint.config.js`

---

## A hand-written check missed what the linter found

### Problem
After migrating 104 route handlers to `next(err)` in Phase 3, I grep-checked for
handlers calling `next` without declaring it. The check reported one hit, which I
inspected and dismissed as a nested-callback false positive. ESLint later found
**three** synchronous handlers genuinely missing the parameter — every error path
in them would have thrown `ReferenceError`.

### Root cause
A regex cannot resolve scope. My check matched on textual proximity, so it both
produced a false positive and missed three true ones.

### Prevention
Use the tool that understands the language. Ad-hoc greps are for exploration, not
verification.

### Related files
`dashboard/routes/guilds.js`, `eslint.config.js`

---

## Guild existence leaked to anonymous callers

### Problem
An unauthenticated request could tell a real guild from a fake one by status code
alone: a real guild fell through to `401 Not authenticated`, an unknown one
returned `404 Server not found`. Anyone could enumerate which servers the bot is
in without ever logging in.

### Root cause
Middleware ordering. `validateGuild` ran before authentication, so it answered
"does this guild exist?" to callers who had not yet proven who they were. Each
guard was individually correct; the *sequence* was not.

### Fix
`requireAuthenticated` now runs first, and malformed ids return `404` rather than
`400`, so real, unknown and malformed ids are indistinguishable to an anonymous
caller. The order is encoded once in `guildAccessStack()`.

### Prevention
Ordering is no longer per-router. Any router mounting the shared stack gets the
correct sequence; there is no hand-assembled chain to get wrong.

### Detection
Send the same unauthenticated request for a real, an unknown and a malformed id.
Any difference in status or body is an oracle.

### Regression test
`auth.test.js` asserts all three return an identical 401.

---

## Rewriting await into .then() changed the semantics

### Problem
While extracting `requireGuildMember` into shared middleware, `await` plus a
truthiness check became `.then(() => next())`. `guild.members.fetch()` resolves
with `null` on a cache miss rather than rejecting, so a non-member was waved
through — reintroducing the cross-guild access the middleware exists to prevent.

### Root cause
Treating "the promise settled" as equivalent to "the operation succeeded". The
original code checked the resolved *value*; the rewrite only checked that it
resolved.

### Fix
`.catch(() => null).then((member) => member ? next() : 403)`.

### Prevention
When converting `await x` to `.then()`, carry the value check across. A promise
resolving with a falsy value is a success path, not a failure path.

### Detection
`isolation.test.js` failed immediately with "cross-guild read of permissions is
refused **200**" — the negative test caught it before the change was committed.

### Regression test
`isolation.test.js` — a logged-in non-member must get 403 on both reads and writes.

---

## Error details leaked to API clients

### Problem
128 route handlers ended with `catch (err) { res.status(500).json({ error: err.message }) }`.
`err.message` was returned verbatim, so an `fs` failure sent
`ENOENT: no such file or directory, open '/srv/app/secret.json'` — an absolute
filesystem path — to any caller. Internal `TypeError`s exposed code structure.

### Root cause
Error handling was written per-route by copy-paste. There was no shared layer, so
there was no single place where "what may a client see?" could be answered. The
default became "everything", because that is what `err.message` is.

### Fix
`dashboard/middleware/errors.js`: a terminal Express error handler that classifies
the failure. Deliberate `ApiError`s and recognised Discord API codes keep their
message and status; everything else becomes a generic `Internal server error`
with a correlation id. The real message and stack are logged server-side only.

### Prevention
Routes now `next(err)`. Adding a new route cannot reintroduce the leak, because
there is no per-route error text to get wrong.

### Detection
`tests/security/errors.test.js` asserts that a route throwing an `ENOENT` with a path in
it returns a response containing no path.

### Regression test
`errors.test.js` — 19 assertions, including that deliberate 400/401/403/404
responses were not swallowed by the migration.

---

## Async event handler rejections vanished

### Problem
`events/index.js` registered listeners as `(...args) => event.execute(...args)`.
Every handler is `async` and discord.js ignores a listener's return value, so any
rejection escaped to `process.on('unhandledRejection')` and the event was lost
with no record of which handler failed.

### Root cause
The error boundary was placed inside individual handlers (7–12 `try/catch` blocks
each) rather than at the dispatch point. Coverage was therefore a function of each
author's diligence, and anything thrown outside those blocks was unprotected.

### Fix
`safeDispatch()` wraps every client and player event, catching both synchronous
throws and promise rejections, and logging the offending event name.

### Prevention
The boundary is at the dispatch layer, so new event files are covered by
construction. The loader also rejects files missing `name` or `execute()`.

### Detection
Emitting a malformed payload through the real loader now logs
`Client event handler rejected: messageCreate` instead of an unhandled rejection.

### Regression test
`tests/security/resilience.test.js` drives the real loader and asserts no unhandled
rejection escapes.

---

## The error handler was itself a crash

### Problem
`process.on('unhandledRejection', (reason) => logger.error(..., { error: reason.message }))`.
A rejection value is not guaranteed to be an `Error`. `Promise.reject('x')` logged
`undefined`; rejecting with `null` made the handler throw.

### Root cause
Assuming the shape of a value that is, by definition, arbitrary.

### Fix
`describe()` handles `Error`, string, number, `null`, `undefined`, plain objects
and circular structures.

### Prevention
Treat any value crossing an error boundary as untyped. Never dereference it
without a guard.

### Regression test
`resilience.test.js` runs `describe()` against seven value shapes including a
circular object.

---

## Read-modify-write races duplicated value

### Problem
`/pay` read a balance, awaited, checked it, then wrote. Two concurrent
invocations both passed the check and both debited the same points: a sender with
100 points paid 100 twice, ending with 200 points in the system.

### Root cause
`quick.db` has no atomic read-modify-write, and every `await` is a yield point.
The code read like a transaction but was not one.

### Fix
`utils/db_lock.js` — per-key serialisation with deterministic multi-key ordering
to avoid deadlock.

### Prevention
Any `get → mutate → set` on a value that represents a resource (money, counters,
quotas) must hold the key lock. Independent keys stay concurrent, so the cost is
near zero.

### Detection
Five concurrent `+1` increments settling at 1 instead of 5 is the signature.

### Regression test
`tests/security/concurrency.test.js` first demonstrates the double-spend against the
unlocked implementation, so the test cannot pass vacuously.

---

## A router bypassed the entire auth stack

### Problem
`dashboard/routes/permissions.js` — the router that edits the permission model —
was readable with **no session at all**, and across guilds the caller did not
belong to.

### Root cause
It mounts at `/api/guild/:guildId/permissions`, which Express matches *before*
`/api/guild/:guildId`. It therefore never inherited the guilds router's
`validateGuild → requireGuildMember → requirePerm(0)` stack. The previous audit
had hardened `guilds.js` and `music.js` and assumed coverage was complete.

### Fix
Its own gate: snowflake validation → authentication → guild membership.

### Prevention
Authorisation lives in shared middleware, and the route inventory is generated
**mechanically** (`grep` over every `router.<method>` across all files) rather
than read by eye. Route-by-route patching does not scale.

### Detection
Enumerating all 152 endpoints programmatically and checking each for a guard.

### Regression test
`tests/security/isolation.test.js` — anonymous and cross-guild access to the permissions
router must return 401/403.

---

## Bulk actions skipped the checks that single actions enforce

### Problem
`POST /verification/kick-pending` issued one Discord kick per pending entry with
no cap and, unlike every single-member action, no hierarchy check. Verified: 81
kicks in one request, including a member ranked above the actor.

### Root cause
The guard was attached to the single-member endpoint, not to the operation. A
second code path performing the same privileged action was written later and did
not inherit it.

### Fix
`hierarchyError()` applied to the sweep, capped at 50 per call, honouring
`member.kickable`, returning `{kicked, skipped, remaining}`.

### Prevention
When adding a guard, search for *every* path that performs the action, not just
the endpoint in front of you. Bulk variants are the usual omission.

### Regression test
`tests/security/abuse.test.js` asserts a member above the actor survives a sweep.

---

## Fallback values can exfiltrate

### Problem
`utils/scheduler_jobs.js` had
`const ownerId = process.env.OWNER_ID || '<author-id-redacted>';` — the original
author's Discord ID. With `OWNER_ID` unset, the bot DM'd the freshly minted
public dashboard URL to a third party on every tunnel rotation.

### Root cause
A convenience default that made the feature "just work" during development, left
in the shipped code.

### Fix
No fallback. The job returns early unless `OWNER_ID` is explicitly configured.

### Prevention
Never hardcode an identity as a default. Missing configuration disables the
feature; it does not substitute someone else's account.

### Detection
Grep for literal Discord snowflakes (`['"][0-9]{17,20}['"]`) in source — this is
now part of the audit checklist.

---

## Recurring principles

1. **Fail closed.** Unknown state denies. A missing environment variable must
   never widen access.
2. **Guard the operation, not the endpoint.** Every code path reaching a
   privileged action needs the check.
3. **Boundaries belong at dispatch points**, not inside each handler — otherwise
   coverage depends on memory.
4. **A test that cannot fail is not a test.** Every regression suite here was run
   against the pre-fix code to confirm it fails there.
5. **Enumerate mechanically.** Route inventories, env vars and blob scans are
   generated by script; reading code by eye missed an entire unauthenticated
   router.
6. **Verify, don't assume — including your own prior work.** Re-checking earlier
   "FIXED" claims is what surfaced the permissions-router hole.

---

## A transport archive looked like the project tree

### Problem
The checkout contained a partial newer tree under `Discord-v1/`, old source fragments at
root, and a bare recovery repository. Treating any one of them as authoritative would
have either deleted 100 commands or restored older, unsafe backend code.

### Root Cause
The repository was exported as a recovery package: unchanged source lived only in the
packed Git objects, while newer files were emitted separately. Directory shape alone did
not communicate source precedence.

### Fix
Inspect the packed tip read-only, hash-compare every overlapping path, reconstruct a
complete baseline in temporary storage, then overlay newer paths before classifying or
moving anything. The transport archive was deleted only after the final tree accounted
for every required feature.

### Prevention
When a checkout contains nested repositories or partial duplicate trees, classify it as a
recovery operation first. Never use modification time or folder depth to choose the winner;
use object identity, dependency references, tests, and documented feature inventory.

### Regression Test
`tests/unit/command-loader.test.js` asserts that all 100 unique commands, all gateway/player
events, shared services, and both server entry points load after reconstruction.

---

## Text replacement is not an import migration

### Problem
Moving a file changes the meaning of every relative path based on both the source file's
old directory and its new directory. A global replacement of `../utils` cannot correctly
handle commands, nested player events, backend routes, and tests at the same time.

### Root Cause
Relative imports encode a graph edge, not a string prefix. Dynamic loaders and filesystem
paths add edges that static import searches do not see.

### Fix
Resolve each old specifier to an actual old target, map both files to their destination,
then calculate the new relative specifier. Audit dynamic `path.join`, `__dirname`, Vite
output, Express static files, database paths, package scripts, and test inventories
separately.

### Prevention
For future moves, maintain an explicit old-to-new path map and run a filesystem-backed
resolver audit. Grep is useful for finding dynamic paths but is not a resolver.

### Regression Test
The final local-specifier audit resolves every `require`, ESM import, and dynamic import to
an existing file (0 failures); the loader test executes the dynamic command/event paths.

---

## Regression tests modified the live SQLite bytes

### Problem
Security tests correctly cleaned up their keys, yet SQLite page allocation still changed
the production database's byte hash. Logical cleanup is not byte-for-byte restoration.

### Root Cause
The database adapter always opened the production default path, including from test
processes. SQLite may rewrite pages and metadata even when final row counts match.

### Fix
`database/index.js` detects test runners (or `NODE_ENV=test`) and uses a process-isolated
SQLite file in the operating-system temp directory. `DATABASE_PATH` remains the explicit
deployment override. The original database was restored from the verified migration copy.

### Prevention
Tests must never point at production persistence by default. Use isolated databases and
verify the production file hash before and after any migration validation.

### Regression Test
Running `tests/security/concurrency.test.js` leaves `database/json.sqlite` at the original
SHA-256 `668487a3328effdb26d51824de955e6e270bd611dcc0ba362d9dbdbd1d115350`.
