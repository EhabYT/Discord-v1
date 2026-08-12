const { db } = require('../../utils/db_wrapper');

const LEVELS = { VIEWER: 0, DJ: 1, MODERATOR: 2, ADMIN: 3 };
const LEVEL_NAMES = ['Viewer', 'DJ', 'Moderator', 'Admin'];
const LEVEL_COLORS = ['gray', 'blue', 'yellow', 'cyan'];

const LEVEL_ACCESS = [
    { level: 0, name: 'Viewer',    desc: 'Read-only access: overview, stats, member list' },
    { level: 1, name: 'DJ',        desc: 'Viewer + music controller (play, skip, queue)' },
    { level: 2, name: 'Moderator', desc: 'DJ + member actions, automod, logging, giveaways' },
    { level: 3, name: 'Admin',     desc: 'Full access including security, settings, permissions' },
];

async function getUserPermLevel(botClient, guildId, userId) {
    if (!userId) return LEVELS.VIEWER;

    const guild = botClient?.guilds.cache.get(guildId);
    if (!guild) return LEVELS.VIEWER;

    if (guild.ownerId === userId) return LEVELS.ADMIN;

    try {
        const app = botClient.application;
        if (app && !app.owner) await app.fetch().catch(() => {});
        const ownerId = app?.owner?.id || app?.owner?.ownerId;
        if (ownerId && userId === ownerId) return LEVELS.ADMIN;
    } catch (_) {}

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return LEVELS.VIEWER;

    if (member.permissions.has('Administrator')) return LEVELS.ADMIN;

    const rolePerms = await db.get(`dashboard_perms_${guildId}`) || [];
    let maxLevel = LEVELS.ADMIN;
    for (const perm of rolePerms) {
        if (member.roles.cache.has(perm.roleId)) {
            maxLevel = Math.max(maxLevel, perm.level);
        }
    }
    return maxLevel;
}

function requireLevel(minLevel) {
    return function (botClient) {
        return async (req, res, next) => {
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const { guildId } = req.params;
            const level = await getUserPermLevel(botClient, guildId, userId);
            if (level < minLevel) {
                return res.status(403).json({
                    error: 'Insufficient permissions',
                    required: LEVEL_NAMES[minLevel],
                    yours: LEVEL_NAMES[level]
                });
            }
            req.permLevel = level;
            next();
        };
    };
}

module.exports = { LEVELS, LEVEL_NAMES, LEVEL_COLORS, LEVEL_ACCESS, getUserPermLevel, requireLevel };
