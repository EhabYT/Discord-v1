const os = require('os');
const path = require('path');
const { QuickDB } = require('quick.db');

const isTestProcess = process.env.NODE_ENV === 'test'
    || process.argv.some((arg) => /(?:^|[\\/])tests[\\/]/.test(arg));
const defaultPath = isTestProcess
    ? path.join(os.tmpdir(), `eb-bot-test-${process.pid}.sqlite`)
    : path.join(__dirname, 'json.sqlite');
const db = new QuickDB({ filePath: process.env.DATABASE_PATH || defaultPath });

/** Direct DB read (no in-memory cache). */
function getCached(key) {
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
