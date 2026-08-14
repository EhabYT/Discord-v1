const { QuickDB } = require('quick.db');
const db = new QuickDB();

/** Direct DB read (no in-memory cache). */
async function getCached(key) {
    return db.get(key);
}

/** Direct DB write. */
async function setCached(key, value) {
    await db.set(key, value);
}

/** Direct DB delete. */
async function deleteCached(key) {
    await db.delete(key);
}

module.exports = { db, getCached, setCached, deleteCached };
