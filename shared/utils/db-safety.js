/**
 * Database Query Safety Utilities
 *
 * Provides helpers to ensure database queries are safe and don't
 * leak sensitive information or allow injection attacks.
 */

const logger = require('../../shared/lib/logger');

/**
 * Patterns that indicate potential SQL injection attempts
 */
const SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE|CAST|CONVERT|TRUNCATE)\b)/i,
    /(--|;|\/\*|\*\/|xp_|sp_)/i,
    /(CHAR\(|CONCAT\(|0x[0-9a-f]+)/i,
    /(SLEEP\(|BENCHMARK\(|WAITFOR)/i,
    /(LOAD_FILE\(|INTO\s+(OUTFILE|DUMPFILE))/i,
];

/**
 * Patterns for dangerous function calls
 */
const DANGEROUS_FUNCTION_PATTERNS = [
    /\beval\s*\(/i,
    /\bnew\s+Function\s*\(/i,
    /\bsetTimeout\s*\(\s*['"]/i,
    /\bsetInterval\s*\(\s*['"]/i,
];

/**
 * Check a value for potential SQL injection patterns.
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if suspicious patterns found
 */
function containsSQLInjection(value) {
    if (value === null || value === undefined) return false;

    const str = String(value);

    for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(str)) {
            return true;
        }
    }

    return false;
}

/**
 * Check a value for dangerous function calls.
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if dangerous functions found
 */
function containsDangerousFunctions(value) {
    if (value === null || value === undefined) return false;

    const str = String(value);

    for (const pattern of DANGEROUS_FUNCTION_PATTERNS) {
        if (pattern.test(str)) {
            return true;
        }
    }

    return false;
}

/**
 * Sanitize a database key/path to prevent injection.
 * Only allows alphanumeric characters, underscores, and dots.
 *
 * @param {string} key - Database key
 * @returns {string} Sanitized key
 */
function sanitizeDbKey(key) {
    if (typeof key !== 'string') return '';

    return key
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .slice(0, 255);
}

/**
 * Validate that a database path is safe.
 *
 * @param {string} path - Database path
 * @returns {boolean} True if path is safe
 */
function isValidDbPath(path) {
    if (typeof path !== 'string') return false;

    if (path.length === 0 || path.length > 500) return false;

    if (containsSQLInjection(path)) return false;

    if (/\.\./.test(path)) return false;

    return true;
}

/**
 * Log suspicious database activity.
 *
 * @param {Object} options - Log options
 * @param {string} options.operation - Database operation
 * @param {*} options.value - Value being queried
 * @param {string} options.path - Database path
 * @param {string} [options.userId] - User ID if available
 */
function logSuspiciousActivity({ operation, value, path, userId }) {
    logger.warn('Suspicious database activity detected', {
        operation,
        value: String(value).slice(0, 100),
        path,
        userId,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Create a safe database wrapper that validates inputs.
 *
 * @param {Object} db - Database instance
 * @returns {Object} Wrapped database with safety checks
 */
function createSafeDbWrapper(db) {
    return {
        get(path) {
            if (!isValidDbPath(path)) {
                logSuspiciousActivity({ operation: 'get', value: path, path });
                return null;
            }
            return db.get(path);
        },

        set(path, value) {
            if (!isValidDbPath(path)) {
                logSuspiciousActivity({ operation: 'set', value: path, path });
                return false;
            }

            const strValue = String(value);
            if (containsSQLInjection(strValue) || containsDangerousFunctions(strValue)) {
                logSuspiciousActivity({ operation: 'set', value: strValue, path });
                return false;
            }

            return db.set(path, value);
        },

        delete(path) {
            if (!isValidDbPath(path)) {
                logSuspiciousActivity({ operation: 'delete', value: path, path });
                return false;
            }
            return db.delete(path);
        },
    };
}

module.exports = {
    containsSQLInjection,
    containsDangerousFunctions,
    sanitizeDbKey,
    isValidDbPath,
    logSuspiciousActivity,
    createSafeDbWrapper,
    SQL_INJECTION_PATTERNS,
    DANGEROUS_FUNCTION_PATTERNS,
};
