/**
 * Permission System — guild half.
 *
 * Product diagram:
 *   Dashboard (Public Dashboard) → Backend → Permission System → Discord Bot / DB
 *
 * Guild dashboard levels (0 Viewer … 3 Admin) gate every `/api/guild/:guildId`
 * route via middleware/guild-access.js. System roles (SUPPORT / DEVELOPER /
 * SUPER_ADMIN) live in middleware/devauth.js and gate `/api/developer/*` and
 * `/api/music/*`. The two halves are intentionally separate: guild Admin never
 * implies system access, and system SUPPORT never implies guild access.
 */
const { db } = require('eb-bot-database');

const LEVELS = { VIEWER: 0, DJ: 1, MODERATOR: 2, ADMIN: 3 };
const LEVEL_NAMES = ['Viewer', 'DJ', 'Moderator', 'Admin'];

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
    let maxLevel = LEVELS.VIEWER;
    for (const perm of rolePerms) {
        if (member.roles.cache.has(perm.roleId)) {
            maxLevel = Math.max(maxLevel, perm.level);
        }
    }
    return maxLevel;
}

module.exports = { LEVELS, LEVEL_NAMES, LEVEL_ACCESS, getUserPermLevel };
