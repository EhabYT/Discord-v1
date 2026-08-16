/**
 * Per-key serialisation for read-modify-write sequences.
 *
 * The key/value adapter uses separate read and write queries. Node is single-threaded, but
 * every `await` is a yield point, so the common pattern
 *
 *     const v = await db.get(key);   // ← other handlers run here
 *     await db.set(key, v + 1);
 *
 * loses updates under concurrency. Measured on this project's own wrapper:
 * five concurrent "+1" increments produced a final value of **1**.
 *
 * That is a correctness bug for XP and streaks, and a security bug for the
 * points economy: two /pay invocations racing past the same balance check both
 * succeed, letting a user spend the same points twice (value duplication).
 *
 * withKeyLock() serialises callbacks that touch the same logical key while
 * leaving unrelated keys fully concurrent. Locks are dropped as soon as the
 * queue for a key drains, so the map cannot grow without bound.
 */

const chains = new Map();

/**
 * Run `fn` with exclusive access to `key`.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withKeyLock(key, fn) {
    const previous = chains.get(key) || Promise.resolve();

    // Chain onto any in-flight work for this key. `.catch` keeps one failed
    // caller from poisoning the queue for everyone behind it.
    const run = previous.then(fn, fn);

    const settled = run.catch(() => {});
    chains.set(key, settled);

    // Release once nothing further has queued behind us.
    settled.then(() => {
        if (chains.get(key) === settled) chains.delete(key);
    });

    return run;
}

/** Serialise a multi-key operation deterministically to avoid deadlock. */
function withKeyLocks(keys, fn) {
    const ordered = [...new Set(keys.map(String))].sort();
    return ordered.reduceRight(
        (next, key) => () => withKeyLock(key, next),
        fn,
    )();
}

module.exports = { withKeyLock, withKeyLocks, _chains: chains };
