const { db } = require('eb-bot-database');
const rr = require('eb-bot-shared/services/reaction-roles');

// Reaction-role + birthday routes extracted from the monolithic guilds
// router (seventh extraction). Registered inline at the exact position the
// routes previously occupied, so Express matching order is unchanged.
// `botClient` is used read-only to enrich birthday entries with usernames,
// mirroring the leaderboard route.
function registerEngagementRoutes(router, { requirePerm, rl, botClient }) {
    router.get('/reactionroles', async (req, res, next) => {
        try {
            const mappings = await rr.list(db, req.params.guildId);
            res.json({ mappings });
        } catch (err) { next(err); }
    });

    router.post('/reactionroles', requirePerm(3), async (req, res, next) => {
        try {
            const { messageId, channelId, emoji, roleId, mode, style, label, group } = req.body || {};
            if (!roleId) return res.status(400).json({ error: 'roleId required' });
            if (!messageId && style !== 'button') return res.status(400).json({ error: 'messageId required for reaction mappings' });
            try {
                rr.assertRoleManageable(req.guild, roleId);
            } catch (err) {
                const status = err.code === 'NOT_FOUND' ? 400 : 403;
                return res.status(status).json({ error: err.message, code: err.code || 'HIERARCHY' });
            }
            const list = await rr.list(db, req.params.guildId);
            list.push({
                id: rr.nid(),
                messageId: messageId || null,
                channelId: channelId || null,
                emoji: emoji || '',
                roleId,
                mode: mode || 'toggle',
                style: style === 'button' ? 'button' : 'reaction',
                label: label || '',
                group: group || '',
                createdAt: Date.now(),
            });
            const mappings = await rr.save(db, req.params.guildId, list);
            if (messageId && emoji && channelId) {
                const ch = req.guild.channels.cache.get(channelId);
                const msg = ch ? await ch.messages.fetch(messageId).catch(() => null) : null;
                if (msg) await msg.react(emoji).catch(() => {});
            }
            res.json({ success: true, mappings });
        } catch (err) { next(err); }
    });

    router.delete('/reactionroles/:id', requirePerm(3), async (req, res, next) => {
        try {
            const list = await rr.list(db, req.params.guildId);
            const mappings = await rr.save(db, req.params.guildId, list.filter((m) => m.id !== req.params.id));
            res.json({ success: true, mappings });
        } catch (err) { next(err); }
    });

    router.post('/reactionroles/panel', requirePerm(3), rl.botMessaging(), async (req, res, next) => {
        try {
            const result = await rr.postPanel(req.guild, db, req.body || {});
            res.json({ success: true, ...result });
        } catch (err) {
            if (err.code === 'HIERARCHY' || err.code === 'MANAGED_ROLE' || err.code === 'EVERYONE' || err.code === 'NO_PERMS') {
                return res.status(403).json({ error: err.message, code: err.code, problems: err.problems || undefined });
            }
            if (err.code === 'NOT_FOUND') {
                return res.status(400).json({ error: err.message, code: err.code });
            }
            next(err);
        }
    });

    function daysUntil(month, day) {
        const now = new Date();
        const next = new Date(now.getFullYear(), month - 1, day);
        if (next < now) next.setFullYear(now.getFullYear() + 1);
        return Math.ceil((next - now) / 86400000);
    }

    router.get('/birthdays', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const cfg = await db.get(`birthday_config_${guildId}`) || {};
            const prefix = `birthday_${guildId}_`;
            const all = await db.allByPrefix(prefix);
            const today = new Date();
            const todayM = today.getMonth() + 1;
            const todayD = today.getDate();
            const entries = all
                .filter((e) => e.value && e.value.month)
                .map((e) => {
                    const userId = e.id.replace(prefix, '');
                    const month = Number(e.value.month);
                    const day = Number(e.value.day);
                    const todayB = todayM === month && todayD === day;
                    return {
                        userId,
                        month,
                        day,
                        setAt: e.value.setAt || 0,
                        days: todayB ? 0 : daysUntil(month, day),
                        today: todayB,
                    };
                })
                .sort((a, b) => a.days - b.days);
            const enrichedEntries = await Promise.all(entries.map(async (entry) => {
                const user = await botClient.users.fetch(entry.userId).catch(() => null);
                return {
                    ...entry,
                    username: user?.username || entry.userId,
                    avatar: user?.displayAvatarURL({ size: 64 }) || null,
                };
            }));
            res.json({
                config: {
                    disabled: !!cfg.disabled,
                    channelId: cfg.channelId || null,
                    roleId: cfg.roleId || null,
                    message: cfg.message || "🎉 {user} it's your birthday today! Happy Birthday! 🎂",
                },
                entries: enrichedEntries,
                today: enrichedEntries.filter((entry) => entry.today).length,
            });
        } catch (err) { next(err); }
    });

    router.post('/birthdays/config', requirePerm(3), async (req, res, next) => {
        try {
            const cfg = await db.get(`birthday_config_${req.params.guildId}`) || {};
            const body = req.body || {};
            if (typeof body.disabled === 'boolean') cfg.disabled = body.disabled;
            if (typeof body.channelId !== 'undefined') cfg.channelId = body.channelId || null;
            if (typeof body.roleId !== 'undefined') cfg.roleId = body.roleId || null;
            if (typeof body.message === 'string') cfg.message = body.message.slice(0, 1000);
            await db.set(`birthday_config_${req.params.guildId}`, cfg);
            res.json(cfg);
        } catch (err) { next(err); }
    });

    router.delete('/birthdays/:userId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `birthday_${req.params.guildId}_${req.params.userId}`;
            try { await db.delete(key); } catch { await db.set(key, null); }
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/birthdays/test', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
        try {
            const cfg = await db.get(`birthday_config_${req.params.guildId}`) || {};
            const channelId = req.body?.channelId || cfg.channelId;
            const channel = req.guild.channels.cache.get(channelId);
            if (!channel) return res.status(400).json({ error: 'Set a birthday channel first' });
            const me = req.guild.members.me;
            let msg = cfg.message || "🎉 {user} it's your birthday today! Happy Birthday! 🎂";
            msg = msg.replace(/{user}/g, String(me)).replace(/{name}/g, me.user.username);
            await channel.send({ content: `**[Test Birthday]** ${msg}` });
            res.json({ success: true });
        } catch (err) { next(err); }
    });
}

module.exports = registerEngagementRoutes;
