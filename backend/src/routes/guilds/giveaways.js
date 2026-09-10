const { db } = require('eb-bot-database');
const { EmbedBuilder } = require('discord.js');
const { withKeyLock } = require('eb-bot-database/lock');
const logger = require('eb-bot-shared/lib/logger');
const { ENTRY_REACTION, finalizeGiveaway, rerollGiveaway } = require('eb-bot-shared/services/giveaways');

// Giveaway routes extracted from the monolithic guilds router (fourth
// extraction). Registered inline at the exact position the routes
// previously occupied, so Express matching order is unchanged.
function registerGiveawaysRoutes(router, { requirePerm }) {
    router.get('/giveaways', async (req, res, next) => {
        try {
            const giveaways = (await db.get(`giveaways_${req.params.guildId}`) || [])
                .sort((a, b) => (b.createdAt || b.endsAt || 0) - (a.createdAt || a.endsAt || 0));
            res.json(giveaways.map(g => ({ ...g, id: g.messageId })));
        } catch (err) { next(err); }
    });

    // Giveaway default settings prefill the dashboard create form.
    router.get('/giveaways/settings', async (req, res, next) => {
        try {
            res.json(await db.get(`giveaway_settings_${req.params.guildId}`) || {});
        } catch (err) { next(err); }
    });

    router.post('/giveaways/settings', requirePerm(2), async (req, res, next) => {
        try {
            const guild = req.guild;
            const {
                channelId = '', duration, winners = 1,
                color = '#FF69B4', dmWinner = true, requiredRoleId = '', host = '',
            } = req.body || {};
            if (channelId && !guild.channels.cache.has(channelId)) {
                return res.status(404).json({ error: 'Default channel not found' });
            }
            if (requiredRoleId && !guild.roles.cache.has(requiredRoleId)) {
                return res.status(400).json({ error: 'Default required role not found' });
            }
            const durationMs = duration == null || duration === '' ? null : Number(duration);
            if (durationMs != null && (!Number.isFinite(durationMs) || durationMs < 60 * 1000 || durationMs > 30 * 24 * 60 * 60 * 1000)) {
                return res.status(400).json({ error: 'Default duration must be between 1 minute and 30 days' });
            }
            const winnerCount = Number(winners);
            if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) {
                return res.status(400).json({ error: 'Default winners must be between 1 and 20' });
            }
            const settings = {
                channelId: channelId || '',
                duration: durationMs,
                winners: winnerCount,
                color: /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : '#FF69B4',
                dmWinner: dmWinner !== false,
                requiredRoleId: requiredRoleId || '',
                host: String(host || '').trim().slice(0, 32),
            };
            await db.set(`giveaway_settings_${req.params.guildId}`, settings);
            res.json(settings);
        } catch (err) { next(err); }
    });

    router.post('/giveaways/create', requirePerm(2), async (req, res, next) => {
        try {
            const {
                prize, description = '', duration, winners = 1, channelId,
                requiredRoleId = '', color = '#FF69B4', dmWinner = true, host = ''
            } = req.body;
            const guild = req.guild;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const durationMs = Number(duration);
            const winnerCount = Number(winners);
            if (!String(prize || '').trim()) return res.status(400).json({ error: 'Prize is required' });
            if (!Number.isFinite(durationMs) || durationMs < 60 * 1000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
                return res.status(400).json({ error: 'Duration must be between 1 minute and 30 days' });
            }
            if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) {
                return res.status(400).json({ error: 'Winners must be between 1 and 20' });
            }
            if (requiredRoleId && !guild.roles.cache.has(requiredRoleId)) {
                return res.status(400).json({ error: 'Required role not found' });
            }
            const hostName = String(host || '').trim().slice(0, 32);

            const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#FF69B4';
            const endsAt = Date.now() + durationMs;
            const details = [
                description.trim(),
                `**Prize:** ${String(prize).trim()}`,
                `**Ends:** <t:${Math.round(endsAt / 1000)}:R>`,
                `**Winners:** ${winnerCount}`,
                requiredRoleId ? `**Requires:** <@&${requiredRoleId}>` : '',
                hostName ? `**Hosted by:** ${hostName}` : '',
                'React with 🎉 to enter!'
            ].filter(Boolean).join('\n');
            const embed = new EmbedBuilder()
                .setTitle('🎉 GIVEAWAY 🎉')
                .setDescription(details)
                .setColor(safeColor)
                .setFooter({ text: `${winnerCount} winner(s) • React with 🎉 to enter` })
                .setTimestamp(endsAt);

            const msg = await channel.send({ embeds: [embed] });
            await msg.react(ENTRY_REACTION);

            const giveaway = {
                messageId: msg.id,
                channelId: channel.id,
                guildId: guild.id,
                prize: String(prize).trim(),
                description: description.trim(),
                winners: winnerCount,
                endsAt,
                active: true,
                hostId: 'Dashboard',
                host: hostName,
                requiredRoleId: requiredRoleId || null,
                color: safeColor,
                dmWinner: dmWinner !== false,
                entries: 0,
                winnerIds: [],
                createdAt: Date.now()
            };
            const giveawaysKey = `giveaways_${guild.id}`;
            await withKeyLock(giveawaysKey, async (lockedDb) => {
                const giveaways = (await lockedDb.get(giveawaysKey)) || [];
                giveaways.push(giveaway);
                await lockedDb.set(giveawaysKey, giveaways);
            }, db);
            res.json({ success: true, giveaway: { ...giveaway, id: giveaway.messageId } });
        } catch (err) { next(err); }
    });

    router.post('/giveaways/:id/end', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, id } = req.params;
            // Read-modify-write on giveaways_<guild>. The scheduler runs the same
            // sequence every 10s, so without the lock one side's write is lost and
            // a finalised giveaway stays active — it is then drawn a second time
            // and the prize is awarded twice.
            const giveawaysKey = `giveaways_${guildId}`;
            const result = await withKeyLock(giveawaysKey, async (lockedDb) => {
                const giveaways = await lockedDb.get(giveawaysKey) || [];
                const giveaway = giveaways.find(g => g.messageId === id && g.active);
                if (!giveaway) return null;
                await finalizeGiveaway(req.guild, giveaway, logger);
                await lockedDb.set(giveawaysKey, giveaways);
                return giveaway;
            }, db);
            if (!result) return res.status(404).json({ error: 'Active giveaway not found' });
            res.json({ success: true, giveaway: { ...result, id: result.messageId } });
        } catch (err) { next(err); }
    });

    router.post('/giveaways/:id/reroll', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, id } = req.params;
            const giveawaysKey = `giveaways_${guildId}`;
            const result = await withKeyLock(giveawaysKey, async (lockedDb) => {
                const giveaways = await lockedDb.get(giveawaysKey) || [];
                const giveaway = giveaways.find(g => g.messageId === id && !g.active);
                if (!giveaway) return null;
                const winner = await rerollGiveaway(req.guild, giveaway);
                await lockedDb.set(giveawaysKey, giveaways);
                return { winner, giveaway };
            }, db);
            if (!result) return res.status(404).json({ error: 'Giveaway not found' });
            res.json({ success: true, winnerId: result.winner, giveaway: { ...result.giveaway, id: result.giveaway.messageId } });
        } catch (err) { next(err); }
    });

    router.delete('/giveaways/:id', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, id } = req.params;
            const giveawaysKey = `giveaways_${guildId}`;
            const deleted = await withKeyLock(giveawaysKey, async (lockedDb) => {
                const giveaways = await lockedDb.get(giveawaysKey) || [];
                const giveaway = giveaways.find(g => g.messageId === id);
                if (!giveaway) return false;
                const channel = await req.guild.channels.fetch(giveaway.channelId).catch(() => null);
                const message = channel ? await channel.messages.fetch(id).catch(() => null) : null;
                if (message) await message.delete().catch(() => {});
                await lockedDb.set(giveawaysKey, giveaways.filter(g => g.messageId !== id));
                return true;
            }, db);
            if (!deleted) return res.status(404).json({ error: 'Giveaway not found' });
            res.json({ success: true });
        } catch (err) { next(err); }
    });
}

module.exports = registerGiveawaysRoutes;
