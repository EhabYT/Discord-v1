const { db } = require('eb-bot-database');

// Rewards + XP routes extracted from the monolithic guilds router (eighth
// extraction). The three ranges were scattered across the file; reward and
// XP paths are distinct from every neighbor, so consolidating them here
// changes no matching behavior.
function registerProgressionRoutes(router, { requirePerm, rl }) {
    router.get('/rewards', async (req, res, next) => {
        const rewards = await db.get(`rewards_${req.params.guildId}`) || [];
        res.json(rewards);
    });

    router.post('/rewards', requirePerm(3), async (req, res, next) => {
        try {
            const { level, roleId } = req.body;
            const rewards = await db.get(`rewards_${req.params.guildId}`) || [];
            rewards.push({ level: parseInt(level), roleId });
            await db.set(`rewards_${req.params.guildId}`, rewards);
            res.json(rewards);
        } catch (err) { next(err); }
    });

    router.post('/rewards/delete', requirePerm(3), async (req, res, next) => {
        try {
            const { level, roleId } = req.body;
            let rewards = await db.get(`rewards_${req.params.guildId}`) || [];
            rewards = rewards.filter(r => !(r.level === level && r.roleId === roleId));
            await db.set(`rewards_${req.params.guildId}`, rewards);
            res.json(rewards);
        } catch (err) { next(err); }
    });

    router.get('/xp/details', async (req, res, next) => {
        try {
            const guildId = req.params.guildId;
            const multiplier = (await db.get(`xp_multiplier_${guildId}`)) || 1.0;
            const ignoredChannels = (await db.get(`xp_ignored_channels_${guildId}`)) || [];
            const availableChannels = req.guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
            res.json({ multiplier, ignoredChannels, availableChannels });
        } catch (err) { next(err); }
    });

    router.post('/xp/advanced', requirePerm(3), async (req, res, next) => {
        try {
            const { multiplier, ignoredChannels } = req.body;
            await db.set(`xp_multiplier_${req.params.guildId}`, parseFloat(multiplier) || 1.0);
            await db.set(`xp_ignored_channels_${req.params.guildId}`, ignoredChannels || []);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    // ── XP Announce ──────────────────────────────────────────────────────────
    router.get('/xp/announce', async (req, res, next) => {
        try {
            const cfg = await db.get(`levelup_announce_${req.params.guildId}`);
            res.json({ cfg: cfg === undefined ? null : cfg });
        } catch (err) { next(err); }
    });

    router.post('/xp/announce', requirePerm(3), async (req, res, next) => {
        try {
            const { channelId, disabled } = req.body;
            if (disabled) {
                await db.set(`levelup_announce_${req.params.guildId}`, false);
            } else if (channelId) {
                await db.set(`levelup_announce_${req.params.guildId}`, { channelId });
            } else {
                await db.set(`levelup_announce_${req.params.guildId}`, null);
            }
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    // ── XP Role Multipliers ───────────────────────────────────────────────────
    router.get('/xp/rolemultipliers', async (req, res, next) => {
        try {
            const list = await db.get(`xp_role_multipliers_${req.params.guildId}`) || [];
            res.json(list);
        } catch (err) { next(err); }
    });

    router.post('/xp/rolemultipliers', requirePerm(3), async (req, res, next) => {
        try {
            const { roleId, value } = req.body;
            if (!roleId || !value) return res.status(400).json({ error: 'roleId and value required' });
            let list = await db.get(`xp_role_multipliers_${req.params.guildId}`) || [];
            list = list.filter(r => r.roleId !== roleId);
            if (parseFloat(value) !== 1) list.push({ roleId, value: parseFloat(value) });
            await db.set(`xp_role_multipliers_${req.params.guildId}`, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/xp/rolemultipliers/:roleId', requirePerm(3), async (req, res, next) => {
        try {
            let list = await db.get(`xp_role_multipliers_${req.params.guildId}`) || [];
            list = list.filter(r => r.roleId !== req.params.roleId);
            await db.set(`xp_role_multipliers_${req.params.guildId}`, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    // ── XP Reset ──
    router.post('/xp/reset', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const [xpCount, statsCount] = await Promise.all([
                db.deletePrefix(`xp_${guildId}_`),
                db.deletePrefix(`stats_${guildId}_`),
            ]);

            res.json({ success: true, cleared: xpCount + statsCount });
        } catch (err) { next(err); }
    });
}

module.exports = registerProgressionRoutes;
