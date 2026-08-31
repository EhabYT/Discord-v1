const { db } = require('eb-bot-database');
const { SYSTEM_ROLES, systemRole } = require('./devauth');

let cached = { at: 0, flags: null };
const CACHE_MS = 5000;
const ALLOWED_PREFIXES = [
    '/api/health', '/api/auth/', '/api/developer/', '/api/dev/', '/api/v2/',
];

async function readFlags() {
    if (cached.flags && Date.now() - cached.at < CACHE_MS) return cached.flags;
    const flags = (await db.get('dev_flags')) || {};
    if (flags.maintenance && flags.maintenanceUntil
        && Number(flags.maintenanceUntil) <= Date.now()) {
        flags.maintenance = false;
        flags.maintenanceUntil = null;
        await db.set('dev_flags', flags);
    }
    // Concurrent cache fills are equivalent; the database value is authoritative.
    // eslint-disable-next-line require-atomic-updates
    cached = { at: Date.now(), flags };
    return flags;
}

function invalidateMaintenanceCache() { cached = { at: 0, flags: null }; }

function maintenanceGuard(botClient) {
    return async (req, res, next) => {
        if (ALLOWED_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))) return next();
        let flags;
        try { flags = await readFlags(); }
        catch { return next(); } // database middleware/error handling reports outages elsewhere
        if (!flags.maintenance) return next();
        if (systemRole(req, botClient) >= SYSTEM_ROLES.SUPPORT) return next();
        if (flags.maintenanceUntil) {
            const seconds = Math.max(1, Math.ceil((Number(flags.maintenanceUntil) - Date.now()) / 1000));
            res.setHeader('Retry-After', String(seconds));
        }
        return res.status(503).json({
            error: String(flags.maintenanceMessage || 'The dashboard is temporarily under maintenance.').slice(0, 300),
            code: 'MAINTENANCE',
            until: flags.maintenanceUntil || null,
        });
    };
}

module.exports = { maintenanceGuard, readFlags, invalidateMaintenanceCache, ALLOWED_PREFIXES };
