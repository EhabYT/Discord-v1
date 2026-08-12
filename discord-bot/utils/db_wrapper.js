const { QuickDB } = require('quick.db');
const db = new QuickDB();

const cache = new Map();
const TTL = 300000; // 5 minutes cache TTL

/**
 * Gets a value from the database with in-memory caching.
 * @param {string} key 
 * @param {boolean} useCache 
 */
async function getCached(key, useCache = true) {
    if (useCache) {
        const entry = cache.get(key);
        if (entry && (Date.now() - entry.timestamp < TTL)) {
            return entry.value;
        }
    }

    const value = await db.get(key);
    if (useCache) {
        cache.set(key, { value, timestamp: Date.now() });
    }
    return value;
}

/**
 * Sets a value in the database and updates the cache.
 * @param {string} key 
 * @param {any} value 
 */
async function setCached(key, value) {
    await db.set(key, value);
    cache.set(key, { value, timestamp: Date.now() });
}

/**
 * Deletes a value from the database and cache.
 * @param {string} key 
 */
async function deleteCached(key) {
    await db.delete(key);
    cache.delete(key);
}

module.exports = { db, getCached, setCached, deleteCached };
