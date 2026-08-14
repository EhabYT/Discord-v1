const express = require('express');
const router = express.Router({ mergeParams: true });
const { db } = require('../../utils/db_wrapper');
const { getUserPermLevel, LEVELS, LEVEL_NAMES, LEVEL_ACCESS } = require('../middleware/permissions');

module.exports = (botClient) => {
    router.get('/my-level', async (req, res) => {
        try {
            const userId = req.session?.user?.id;
            const { guildId } = req.params;
            const level = await getUserPermLevel(botClient, guildId, userId);
            res.json({ level, levelName: LEVEL_NAMES[level], levelAccess: LEVEL_ACCESS });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/', async (req, res) => {
        try {
            const { guildId } = req.params;
            const perms = await db.get(`dashboard_perms_${guildId}`) || [];

            const guild = botClient?.guilds.cache.get(guildId);
            const enriched = perms.map(p => {
                const role = guild?.roles.cache.get(p.roleId);
                return { ...p, roleName: role?.name || 'Unknown Role', roleColor: role?.hexColor || '#888888' };
            });

            res.json({ perms: enriched, levelAccess: LEVEL_ACCESS });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/', async (req, res) => {
        try {
            const { guildId } = req.params;
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });

            const userLevel = await getUserPermLevel(botClient, guildId, userId);
            if (userLevel < LEVELS.ADMIN) return res.status(403).json({ error: 'Admin access required' });

            const { roleId, level } = req.body;
            if (!roleId || level === undefined) return res.status(400).json({ error: 'Missing roleId or level' });
            if (level < 0 || level > 3) return res.status(400).json({ error: 'Invalid level (0-3)' });

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
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/:roleId', async (req, res) => {
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
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
};
