/**
 * Per-key serialisation for read-modify-write sequences.
 *
 * Promise chains provide deterministic in-process ordering and keep the memory
 * database safe in tests. PostgreSQL operations additionally acquire
 * transaction-scoped advisory locks, so the same logical operation is also
 * exclusive across multiple bot/backend instances.
 *
 * Callbacks receive a database adapter. On PostgreSQL it is bound to the same
 * dedicated client and transaction that owns the advisory locks. Critical
 * callers must use that adapter rather than the shared pool-backed instance.
 */

const { db: defaultDb } = require('./index');

const chains = new Map();

/**
 * Run `fn` under the process-local queues for all sorted keys.
 * @template T
 * @param {string[]} orderedKeys
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withLocalKeyLocks(orderedKeys, fn) {
    return orderedKeys.reduceRight((next, key) => {
        return () => {
            const previous = chains.get(key) || Promise.resolve();
            const run = previous.then(next, next);
            const settled = run.catch(() => {});
            chains.set(key, settled);
            settled.then(() => {
                if (chains.get(key) === settled) chains.delete(key);
            });
            return run;
        };
    }, fn)();
}

/**
 * Run `fn` with exclusive access to one logical key.
 * @template T
 * @param {string} key
 * @param {(lockedDb: object) => Promise<T>} fn
 * @param {object} database
 * @returns {Promise<T>}
 */
function withKeyLock(key, fn, database = defaultDb) {
    return withKeyLocks([key], fn, database);
}

/**
 * Lock multiple logical keys in deterministic order to avoid deadlocks.
 * @template T
 * @param {string[]} keys
 * @param {(lockedDb: object) => Promise<T>} fn
 * @param {object} database
 * @returns {Promise<T>}
 */
function withKeyLocks(keys, fn, database = defaultDb) {
    const ordered = [...new Set(keys.map(String))].sort();
    return withLocalKeyLocks(ordered, () => {
        if (typeof database.withAdvisoryLocks === 'function') {
            return database.withAdvisoryLocks(ordered, fn);
        }
        return fn(database);
    });
}

module.exports = { withKeyLock, withKeyLocks, _chains: chains };
