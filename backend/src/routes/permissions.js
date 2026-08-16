const express = require('express');
const router = express.Router({ mergeParams: true });
const { db } = require('../../../database/index');
const { getUserPermLevel, LEVELS, LEVEL_NAMES, LEVEL_ACCESS } = require('../middleware/permissions');
const guildAccess = require('../middleware/guild-access');

module.exports = (botClient) => {
    // This router is mounted at /api/guild/:guildId/permissions, which Express
    // matches BEFORE /api/guild/:guildId, so it does NOT inherit the guilds
    // router's middleware. It shipped readable with no session at all and
    // across guilds the caller did not belong to.
    //
    // It previously carried a hand-written copy of that gate. Now both routers
    // use the same implementation, so the rule cannot drift between them.
    router.use(guildAccess.guildAccessStack(botClient, 0));

    router.get('/my-level', async (req, res, next) => {
        try {
            const userId = req.session?.user?.id;
            const { guildId } = req.params;
            const level = await getUserPermLevel(botClient, guildId, userId);
            res.json({ level, levelName: LEVEL_NAMES[level], levelAccess: LEVEL_ACCESS });
        } catch (err) { next(err); }
    });

    router.get('/', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const perms = await db.get(`dashboard_perms_${guildId}`) || [];

            const guild = botClient?.guilds.cache.get(guildId);
            const enriched = perms.map(p => {
                const role = guild?.roles.cache.get(p.roleId);
                return { ...p, roleName: role?.name || 'Unknown Role', roleColor: role?.hexColor || '#888888' };
            });

            res.json({ perms: enriched, levelAccess: LEVEL_ACCESS });
        } catch (err) { next(err); }
    });

    router.post('/', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const userLevel = await getUserPermLevel(botClient, guildId, userId);
            if (userLevel < LEVELS.ADMIN) return res.status(403).json({ error: 'Admin access required' });

            const { roleId, level } = req.body;
            if (!roleId || level === undefined) return res.status(400).json({ error: 'Missing roleId or level' });
            if (!/^\d{17,20}$/.test(String(roleId))) return res.status(400).json({ error: 'Invalid role id' });
            if (!Number.isInteger(level) || level < 0 || level > 3) return res.status(400).json({ error: 'Invalid level (0-3)' });
            if (!req.guild.roles.cache.has(String(roleId))) return res.status(400).json({ error: 'Role not found in this server' });

            let perms = await db.get(`dashboard_perms_${guildId}`) || [];
            const existing = perms.find(p => p.roleId === roleId);
            if (existing) { existing.level = level; }
            else { perms.push({ roleId, level }); }

            await db.set(`dashboard_perms_${guildId}`, perms);

            const guild = botClient?.guilds.cache.get(guildId);
            const enriched = perms.map(p => {
                const role = guild?.roles.cache.get(p.roleId);
                return { ...p, roleName: role?.name || 'Unknown Role', roleColor: role?.hexColor || '#888888' };
            });
            res.json({ perms: enriched });
        } catch (err) { next(err); }
    });

    router.delete('/:roleId', async (req, res, next) => {
        try {
            const { guildId, roleId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const userLevel = await getUserPermLevel(botClient, guildId, userId);
            if (userLevel < LEVELS.ADMIN) return res.status(403).json({ error: 'Admin access required' });

            let perms = await db.get(`dashboard_perms_${guildId}`) || [];
            perms = perms.filter(p => p.roleId !== roleId);
            await db.set(`dashboard_perms_${guildId}`, perms);

            const guild = botClient?.guilds.cache.get(guildId);
            const enriched = perms.map(p => {
                const role = guild?.roles.cache.get(p.roleId);
                return { ...p, roleName: role?.name || 'Unknown Role', roleColor: role?.hexColor || '#888888' };
            });
            res.json({ perms: enriched });
        } catch (err) { next(err); }
    });

    return router;
};
