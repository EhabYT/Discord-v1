const express = require('express');
const router = express.Router({ mergeParams: true });
const { db } = require('../../utils/db_wrapper');
const { EmbedBuilder, WebhookClient, PermissionsBitField } = require('discord.js');
const { getUserPermLevel, LEVELS } = require('../middleware/permissions');
const logger = require('../../utils_logger');
const { ENTRY_REACTION, finalizeGiveaway, rerollGiveaway } = require('../../utils/giveaway_service');

module.exports = (botClient) => {
    function requirePerm(minLevel) {
        return async (req, res, next) => {
            const userId = req.session?.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authenticated' });
            const level = await getUserPermLevel(botClient, req.params.guildId, userId);
            if (level < minLevel) {
                const names = ['Viewer', 'DJ', 'Moderator', 'Admin'];
                return res.status(403).json({ error: 'Insufficient permissions', required: names[minLevel], yours: names[level] });
            }
            next();
        };
    }

    // ── Middleware: Validate Guild Access ──
    async function validateGuild(req, res, next) {
        const { guildId } = req.params;
        if (!botClient) return res.status(503).json({ error: 'Bot is initializing' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Server not found' });

        req.guild = guild;
        next();
    }

    // Apply validation to all routes in this router
    router.use(validateGuild);

    router.get('/', async (req, res) => {
        try {
            const { guildId } = req.params;
            const guild = req.guild;

            const [automod, welcome, logging, djrole, xpEnabled, giveaways, commandsEnabled, tickets, rewards, customFilters, autoresponder] = await Promise.all([
                db.get(`automod_${guildId}`),
                db.get(`welcome_${guildId}`),
                db.get(`logging_${guildId}`),
                db.get(`djrole_${guildId}`),
                db.get(`xp_enabled_${guildId}`),
                db.get(`giveaways_${guildId}`),
                db.get(`commands_enabled_${guildId}`),
                db.get(`tickets_${guildId}`),
                db.get(`rewards_${guildId}`),
                db.get(`custom_filters_${guildId}`),
                db.get(`autoresponder_${guildId}`)
            ]);

            const activeGiveaways = (giveaways || []).filter(g => g.active).length;

            let diagnostics = { status: 'Healthy', missingPermissions: [] };
            const botMember = guild.members.me;
            const required = [
                { bit: PermissionsBitField.Flags.ManageChannels, name: 'Manage Channels', feature: 'Slowmode/Lock' },
                { bit: PermissionsBitField.Flags.ModerateMembers, name: 'Moderate Members', feature: 'Timeout' },
                { bit: PermissionsBitField.Flags.BanMembers, name: 'Ban Members', feature: 'Ban' },
                { bit: PermissionsBitField.Flags.KickMembers, name: 'Kick Members', feature: 'Kick' },
                { bit: PermissionsBitField.Flags.ManageMessages, name: 'Manage Messages', feature: 'AutoMod/Cleanup' },
                { bit: PermissionsBitField.Flags.EmbedLinks, name: 'Embed Links', feature: 'Rich Messages' },
                { bit: PermissionsBitField.Flags.SendMessages, name: 'Send Messages', feature: 'Core Response' }
            ];

            required.forEach(p => {
                if (!botMember.permissions.has(p.bit)) {
                    diagnostics.missingPermissions.push({ name: p.name, feature: p.feature });
                }
            });

            if (diagnostics.missingPermissions.length > 0) {
                diagnostics.status = diagnostics.missingPermissions.length > 3 ? 'Critical' : 'Limited';
            }

            res.json({
                guild: {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL({ size: 128 }),
                    memberCount: guild.memberCount,
                    xpEnabled: xpEnabled !== false,
                    channels: guild.channels.cache
                        .filter(c => [0, 2, 4, 5, 13, 15].includes(c.type))
                        .map(c => ({ id: c.id, name: c.name, type: c.type })),
                    roles: guild.roles.cache
                        .filter(r => r.name !== '@everyone' && !r.managed)
                        .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
                },
                diagnostics,
                automod: automod || {},
                welcome: welcome || { enabled: false, message: '', channelId: null, autoRoleId: null },
                logging: logging || {},
                djrole,
                activeGiveaways,
                tickets: tickets || { categoryId: null, transcriptChannelId: null },
                commandsEnabled: commandsEnabled || {},
                rewards: rewards || [],
                customFilters: customFilters || [],
                autoresponder: autoresponder || []
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/leaderboard', async (req, res) => {
        try {
            const { guildId } = req.params;
            const type = req.query.type || 'xp';
            const all = await db.all();

            let entries = [];
            const filterPrefix = type === 'xp' ? `xp_${guildId}_` : `stats_${guildId}_`;

            entries = all
                .filter(e => e.id.startsWith(filterPrefix))
                .map(e => ({ userId: e.id.replace(filterPrefix, ''), ...e.value }));

            if (type === 'xp') {
                entries.sort((a, b) => (b.textLevel * 100 + b.textXp) - (a.textLevel * 100 + a.textXp));
            } else if (type === 'messages') {
                entries.sort((a, b) => b.messages - a.messages);
            } else if (type === 'voice') {
                entries.sort((a, b) => b.voiceTime - a.voiceTime);
            }

            entries = entries.slice(0, 15);

            await Promise.all(entries.map(async entry => {
                const user = await botClient.users.fetch(entry.userId).catch(() => null);
                entry.username = user ? user.username : entry.userId;
                entry.avatar = user ? user.displayAvatarURL({ size: 32 }) : null;
            }));

            res.json(entries);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/warnings', async (req, res) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const warnings = allKeys
                .filter(e => e.id.startsWith(`warnings_${guildId}_`))
                .flatMap(e => (e.value || []).map(w => ({
                    userId: e.id.replace(`warnings_${guildId}_`, ''),
                    ...w
                })));
            res.json(warnings);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/activity', async (req, res) => {
        try {
            const { guildId } = req.params;
            const guild = req.guild;

            const ACTION_LABELS = {
                1: ['Guild Updated', 'server_update'],
                10: ['Channel Created', 'channel_create'],
                11: ['Channel Updated', 'channel_update'],
                12: ['Channel Deleted', 'channel_delete'],
                20: ['Member Kicked', 'kick'],
                21: ['Members Pruned', 'kick'],
                22: ['Member Banned', 'ban'],
                23: ['Member Unbanned', 'unban'],
                24: ['Member Updated', 'member_update'],
                25: ['Member Roles Updated', 'role_update'],
                30: ['Role Created', 'role_create'],
                31: ['Role Updated', 'role_update'],
                32: ['Role Deleted', 'role_delete'],
                40: ['Invite Created', 'invite'],
                42: ['Invite Deleted', 'invite'],
                50: ['Webhook Created', 'webhook'],
                51: ['Webhook Updated', 'webhook'],
                52: ['Webhook Deleted', 'webhook'],
                60: ['Emoji Created', 'emoji'],
                61: ['Emoji Updated', 'emoji'],
                62: ['Emoji Deleted', 'emoji'],
                72: ['Messages Deleted', 'msg_delete'],
                73: ['Messages Bulk Deleted', 'msg_delete'],
                74: ['Message Pinned', 'pin'],
                75: ['Message Unpinned', 'pin'],
                80: ['Integration Created', 'integration'],
                81: ['Integration Updated', 'integration'],
                82: ['Integration Deleted', 'integration'],
                83: ['Stage Instance Created', 'stage'],
                84: ['Stage Instance Updated', 'stage'],
                85: ['Stage Instance Deleted', 'stage'],
                110: ['Thread Created', 'thread'],
                111: ['Thread Updated', 'thread'],
                112: ['Thread Deleted', 'thread'],
                140: ['AutoMod Rule Created', 'automod'],
                141: ['AutoMod Rule Updated', 'automod'],
                142: ['AutoMod Rule Deleted', 'automod'],
                143: ['AutoMod Blocked Message', 'automod'],
            };
            const [audit, allKeys] = await Promise.all([
                guild.fetchAuditLogs({ limit: 25 }).catch(() => ({ entries: [] })),
                db.all()
            ]);

            const activities = [...audit.entries.values()].map(e => {
                const executor = botClient.users.cache.get(e.executorId);
                const [label, category] = ACTION_LABELS[e.action] || [`Action #${e.action}`, 'other'];
                const targetName = e.target ? (e.target.tag || e.target.username || e.target.name || e.target.id) : null;
                return {
                    type: 'audit',
                    action: e.action,
                    category,
                    label,
                    executor: { id: e.executorId, name: executor?.username || 'Unknown', avatar: executor?.displayAvatarURL({ size: 32 }) || null },
                    target: targetName ? { id: e.target?.id, name: targetName } : null,
                    reason: e.reason || null,
                    timestamp: e.createdTimestamp,
                    description: targetName ? `${label}: ${targetName}` : label,
                };
            });

            const warnings = allKeys
                .filter(e => e.id.startsWith(`warnings_${guildId}_`))
                .flatMap(e => (e.value || []).map(w => ({
                    type: 'warning',
                    userId: e.id.replace(`warnings_${guildId}_`, ''),
                    reason: w.reason,
                    moderator: w.moderator,
                    timestamp: w.timestamp || Date.now()
                })));

            const combined = [...activities, ...warnings]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 20);

            res.json(combined);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/automod', requirePerm(2), async (req, res) => {
        try {
            const { guildId } = req.params;
            const { setting, value, threshold } = req.body;
            const validSettings = ['antiSpam', 'antiLinks', 'badWords', 'caps', 'emojis', 'mentions'];
            if (!validSettings.includes(setting)) return res.status(400).json({ error: 'Invalid setting' });

            const automod = await db.get(`automod_${guildId}`) || {};
            if (['antiSpam', 'antiLinks', 'badWords'].includes(setting)) {
                automod[setting] = !!value;
            } else {
                if (!automod[setting]) automod[setting] = { enabled: false, threshold: 5 };
                if (typeof value !== 'undefined') automod[setting].enabled = !!value;
                if (typeof threshold !== 'undefined') automod[setting].threshold = parseInt(threshold);
            }
            await db.set(`automod_${guildId}`, automod);
            res.json({ automod });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/welcome', async (req, res) => {
        try {
            const { guildId } = req.params;
            const { enabled, message, channelId, autoRoleId, embed,
                cardEnabled,
                leaveEnabled, leaveChannel, leaveMessage,
                dmEnabled, dmMessage } = req.body;
            const config = await db.get(`welcome_${guildId}`) || {};
            if (typeof enabled !== 'undefined') config.enabled = !!enabled;
            if (typeof message !== 'undefined') config.message = message;
            if (typeof channelId !== 'undefined') config.channelId = channelId;
            if (typeof autoRoleId !== 'undefined') config.autoRoleId = autoRoleId;
            if (typeof embed !== 'undefined') config.embed = embed;
            if (typeof cardEnabled !== 'undefined') config.cardEnabled = !!cardEnabled;
            if (typeof leaveEnabled !== 'undefined') config.leaveEnabled = !!leaveEnabled;
            if (typeof leaveChannel !== 'undefined') config.leaveChannel = leaveChannel;
            if (typeof leaveMessage !== 'undefined') config.leaveMessage = leaveMessage;
            if (typeof dmEnabled !== 'undefined') config.dmEnabled = !!dmEnabled;
            if (typeof dmMessage !== 'undefined') config.dmMessage = dmMessage;
            await db.set(`welcome_${guildId}`, config);
            res.json(config);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/verification', async (req, res) => {
        try {
            const config = await db.get(`verification_${req.params.guildId}`) || { enabled: false, roleId: null };
            res.json(config);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/verification', async (req, res) => {
        try {
            const { guildId } = req.params;
            const { enabled, roleId, logChannelId } = req.body;
            const config = await db.get(`verification_${guildId}`) || { enabled: false, roleId: null, logChannelId: null };
            if (typeof enabled !== 'undefined') config.enabled = !!enabled;
            if (typeof roleId !== 'undefined') config.roleId = roleId;
            if (typeof logChannelId !== 'undefined') config.logChannelId = logChannelId;
            await db.set(`verification_${guildId}`, config);
            res.json(config);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // GET /tickets — list open tickets
    router.get('/tickets', async (req, res) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const tickets = allKeys
                .filter(e => e.id.startsWith(`ticket_${guildId}_`))
                .map(e => ({ id: e.id.replace(`ticket_${guildId}_`, ''), ...e.value }));
            res.json(tickets);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/logging', requirePerm(2), async (req, res) => {
        try {
            const { guildId } = req.params;
            const { type, channelId } = req.body;
            const validTypes = ['messages', 'msg_delete', 'bulk_delete', 'members', 'moderation', 'channels', 'voice', 'invites', 'mute_def', 'server_update', 'unban', 'role_update', 'member_leave', 'move', 'kick', 'role_delete', 'channel_delete', 'ban'];
            if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid log type' });

            const logging = await db.get(`logging_${guildId}`) || {};
            logging[type] = channelId || null;
            await db.set(`logging_${guildId}`, logging);
            res.json(logging);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/config', async (req, res) => {
        try {
            const { xpEnabled } = req.body;
            if (typeof xpEnabled !== 'undefined') {
                await db.set(`xp_enabled_${req.params.guildId}`, !!xpEnabled);
            }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/giveaways', async (req, res) => {
        try {
            const giveaways = (await db.get(`giveaways_${req.params.guildId}`) || [])
                .sort((a, b) => (b.createdAt || b.endsAt || 0) - (a.createdAt || a.endsAt || 0));
            res.json(giveaways.map(g => ({ ...g, id: g.messageId })));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/giveaways/create', requirePerm(2), async (req, res) => {
        try {
            const {
                prize, description = '', duration, winners = 1, channelId,
                requiredRoleId = '', color = '#FF69B4', dmWinner = true
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

            const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#FF69B4';
            const endsAt = Date.now() + durationMs;
            const details = [
                description.trim(),
                `**Prize:** ${String(prize).trim()}`,
                `**Ends:** <t:${Math.round(endsAt / 1000)}:R>`,
                `**Winners:** ${winnerCount}`,
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
                requiredRoleId: requiredRoleId || null,
                color: safeColor,
                dmWinner: dmWinner !== false,
                entries: 0,
                winnerIds: [],
                createdAt: Date.now()
            };
            const giveaways = (await db.get(`giveaways_${guild.id}`)) || [];
            giveaways.push(giveaway);
            await db.set(`giveaways_${guild.id}`, giveaways);
            res.json({ success: true, giveaway: { ...giveaway, id: giveaway.messageId } });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/giveaways/:id/end', requirePerm(2), async (req, res) => {
        try {
            const { guildId, id } = req.params;
            const giveaways = await db.get(`giveaways_${guildId}`) || [];
            const giveaway = giveaways.find(g => g.messageId === id && g.active);
            if (!giveaway) return res.status(404).json({ error: 'Active giveaway not found' });

            await finalizeGiveaway(req.guild, giveaway, logger);
            await db.set(`giveaways_${guildId}`, giveaways);
            res.json({ success: true, giveaway: { ...giveaway, id: giveaway.messageId } });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/giveaways/:id/reroll', requirePerm(2), async (req, res) => {
        try {
            const { id } = req.params;
            const giveaways = await db.get(`giveaways_${req.params.guildId}`) || [];
            const giveaway = giveaways.find(g => g.messageId === id && !g.active);
            if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

            const winner = await rerollGiveaway(req.guild, giveaway);
            await db.set(`giveaways_${req.params.guildId}`, giveaways);
            res.json({ success: true, winnerId: winner, giveaway: { ...giveaway, id: giveaway.messageId } });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/giveaways/:id', requirePerm(2), async (req, res) => {
        try {
            const { guildId, id } = req.params;
            const giveaways = await db.get(`giveaways_${guildId}`) || [];
            const giveaway = giveaways.find(g => g.messageId === id);
            if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

            const channel = await req.guild.channels.fetch(giveaway.channelId).catch(() => null);
            const message = channel ? await channel.messages.fetch(id).catch(() => null) : null;
            if (message) await message.delete().catch(() => {});

            await db.set(`giveaways_${guildId}`, giveaways.filter(g => g.messageId !== id));
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/members', async (req, res) => {
        try {
            const query = (req.query.q || '').toLowerCase();
            let members = await req.guild.members.fetch();
            if (query) {
                members = members.filter(m => m.user.username.toLowerCase().includes(query) || (m.nickname && m.nickname.toLowerCase().includes(query)) || m.id.includes(query));
            }
            const data = members.first(50).map(m => ({ id: m.id, username: m.user.username, displayName: m.displayName, avatar: m.user.displayAvatarURL({ size: 64 }), joinedAt: m.joinedAt, roles: m.roles.cache.size - 1, isStaff: m.permissions.has('ManageMessages') }));
            res.json(data);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/members/:userId/action', requirePerm(2), async (req, res) => {
        try {
            const { userId } = req.params;
            const { action, reason, duration } = req.body;
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            if (action === 'kick') await member.kick(reason || 'Dashboard Action');
            else if (action === 'ban') await member.ban({ reason: reason || 'Dashboard Action' });
            else if (action === 'timeout') await member.timeout(duration || 60000, reason || 'Dashboard Action');
            else if (action === 'warn') {
                const warnings = await db.get(`warnings_${req.params.guildId}_${userId}`) || [];
                warnings.push({ reason: reason || 'Dashboard Action', moderator: 'Dashboard', timestamp: Date.now() });
                await db.set(`warnings_${req.params.guildId}_${userId}`, warnings);
            }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/members/:userId/roles', requirePerm(3), async (req, res) => {
        try {
            const { userId } = req.params;
            const { roles } = req.body;
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });
            await member.roles.set(roles);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/rewards', async (req, res) => {
        const rewards = await db.get(`rewards_${req.params.guildId}`) || [];
        res.json(rewards);
    });

    router.post('/rewards', async (req, res) => {
        try {
            const { level, roleId } = req.body;
            const rewards = await db.get(`rewards_${req.params.guildId}`) || [];
            rewards.push({ level: parseInt(level), roleId });
            await db.set(`rewards_${req.params.guildId}`, rewards);
            res.json(rewards);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/rewards/delete', async (req, res) => {
        try {
            const { level, roleId } = req.body;
            let rewards = await db.get(`rewards_${req.params.guildId}`) || [];
            rewards = rewards.filter(r => !(r.level === level && r.roleId === roleId));
            await db.set(`rewards_${req.params.guildId}`, rewards);
            res.json(rewards);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/nickname', requirePerm(3), async (req, res) => {
        try {
            await req.guild.members.me.setNickname(req.body.nickname);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/automod/custom', async (req, res) => {
        try {
            const { pattern } = req.body;
            if (!pattern) return res.status(400).json({ error: 'Missing pattern' });
            const filters = await db.get(`custom_filters_${req.params.guildId}`) || [];
            if (!filters.includes(pattern)) {
                filters.push(pattern);
                await db.set(`custom_filters_${req.params.guildId}`, filters);
            }
            res.json(filters);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/automod/custom/delete', async (req, res) => {
        try {
            const { pattern } = req.body;
            let filters = await db.get(`custom_filters_${req.params.guildId}`) || [];
            filters = filters.filter(f => f !== pattern);
            await db.set(`custom_filters_${req.params.guildId}`, filters);
            res.json(filters);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/tickets', async (req, res) => {
        try {
            const { guildId } = req.params;
            const { categoryId, transcriptChannelId, supportRoleId, maxOpen } = req.body;
            const config = await db.get(`tickets_${guildId}`) || { categoryId: null, transcriptChannelId: null };
            if (categoryId !== undefined) config.categoryId = categoryId;
            if (transcriptChannelId !== undefined) config.transcriptChannelId = transcriptChannelId;
            if (supportRoleId !== undefined) config.supportRoleId = supportRoleId;
            if (maxOpen !== undefined) config.maxOpen = maxOpen;
            await db.set(`tickets_${guildId}`, config);
            res.json(config);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /welcome/test — send a test welcome message to a channel
    router.post('/welcome/test', async (req, res) => {
        try {
            const { channelId } = req.body;
            const guild = req.guild;
            const config = await db.get(`welcome_${req.params.guildId}`) || {};
            const channel = channelId ? guild.channels.cache.get(channelId) : null;
            if (!channel) return res.status(400).json({ error: 'Channel not found' });
            const member = guild.members.me;
            let msg = (config.message || 'Welcome {user} to {guild}!')
                .replace(/{user}/g, member.toString())
                .replace(/{userName}/g, member.user.username)
                .replace(/{guild}/g, guild.name)
                .replace(/{count}/g, guild.memberCount.toString());
            await channel.send({ content: `**[Test Welcome]** ${msg}` });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /tickets/panel — post a ticket button panel embed in a channel
    router.post('/tickets/panel', async (req, res) => {
        try {
            const { channelId, title, description } = req.body;
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const guild = req.guild;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(400).json({ error: 'Channel not found' });
            const embed = new EmbedBuilder()
                .setTitle(title || 'Support Tickets')
                .setDescription(description || 'Click the button below to open a support ticket.')
                .setColor(0x00FFFF)
                .setFooter({ text: guild.name });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_open')
                    .setLabel('Open Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫')
            );
            await channel.send({ embeds: [embed], components: [row] });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST /tickets/:ticketId/close — mark a ticket closed
    router.post('/tickets/:ticketId/close', async (req, res) => {
        try {
            const { guildId, ticketId } = req.params;
            const key = `ticket_${guildId}_${ticketId}`;
            const ticket = await db.get(key);
            if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
            ticket.status = 'closed';
            ticket.closedAt = Date.now();
            await db.set(key, ticket);
            res.json({ success: true, ticket });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/embed', requirePerm(3), async (req, res) => {
        try {
            const { channelId, title, titleUrl, description, color,
                author, authorIconUrl,
                footer, footerIconUrl,
                image, thumbnail, fields, addTimestamp } = req.body;
            const channel = req.guild.channels.cache.get(channelId);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const embed = new EmbedBuilder().setColor(color || '#00fbff');
            if (title) { embed.setTitle(title); if (titleUrl) embed.setURL(titleUrl); }
            if (description) embed.setDescription(description);
            if (author) embed.setAuthor({ name: author, iconURL: authorIconUrl || null });
            if (footer) embed.setFooter({ text: footer, iconURL: footerIconUrl || null });
            if (image) embed.setImage(image);
            if (thumbnail) embed.setThumbnail(thumbnail);
            if (addTimestamp) embed.setTimestamp();
            if (fields?.length) embed.addFields(fields.filter(f => f.name && f.value).map(f => ({ name: f.name, value: f.value, inline: !!f.inline })));

            await channel.send({ embeds: [embed] });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    
    router.post('/welcome/test', async (req, res) => {
        try {
            const { channelId } = req.body;
            const { guildId } = req.params;
            const ch = req.guild.channels.cache.get(channelId);
            if (!ch) return res.status(404).json({ error: 'Channel not found' });
            const cfg = await db.get(`welcome_${guildId}`) || {};
            const replaceVars = str => str
                .replace(/{user}/g, `<@${req.user.id}>`)
                .replace(/{userName}/g, req.user.username || 'TestUser')
                .replace(/{guild}/g, req.guild.name)
                .replace(/{count}/g, req.guild.memberCount);
            const payload = { content: replaceVars(cfg.message || 'Welcome {user} to {guild}! (Test message)') };
            if (cfg.embed && cfg.embed.title) {
                const { EmbedBuilder } = require('discord.js');
                const em = new EmbedBuilder().setColor(cfg.embed.color || '#00fbff');
                if (cfg.embed.title) em.setTitle(replaceVars(cfg.embed.title));
                if (cfg.embed.description) em.setDescription(replaceVars(cfg.embed.description));
                if (cfg.embed.footer) em.setFooter({ text: replaceVars(cfg.embed.footer) });
                payload.embeds = [em];
            }
            await ch.send(payload);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    // ── Security Config (Anti-Raid / Anti-Spam) ──
    router.get('/security', async (req, res) => {
        try {
            const config = await db.get(`security_${req.params.guildId}`) || {};
            res.json(config);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/security', requirePerm(3), async (req, res) => {
        try {
            const { guildId } = req.params;
            const { antiRaid, antiSpam } = req.body;
            const config = await db.get(`security_${guildId}`) || {};
            if (antiRaid) config.antiRaid = { ...config.antiRaid, ...antiRaid };
            if (antiSpam) config.antiSpam = { ...config.antiSpam, ...antiSpam };
            await db.set(`security_${guildId}`, config);
            res.json(config);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/commands/toggle', requirePerm(3), async (req, res) => {
        try {
            const { commandName, enabled } = req.body;
            if (!commandName) return res.status(400).json({ error: 'Missing command name' });
            const current = await db.get(`commands_enabled_${req.params.guildId}`) || {};
            current[commandName] = !!enabled;
            await db.set(`commands_enabled_${req.params.guildId}`, current);
            res.json(current);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/test-welcome', async (req, res) => {
        try {
            botClient.emit('guildMemberAdd', req.guild.members.me);
            res.json({ success: true, message: 'Test event emitted' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/backup', async (req, res) => {
        try {
            const { guildId } = req.params;
            const keys = [`settings_${guildId}`, `logging_${guildId}`, `welcome_${guildId}`, `verification_${guildId}`, `toggles_${guildId}`, `autoroles_${guildId}`, `ticket_config_${guildId}`];
            const backup = {};
            for (const key of keys) backup[key] = await db.get(key);
            res.json(backup);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/restore', requirePerm(3), async (req, res) => {
        try {
            const backup = req.body;
            if (!backup || typeof backup !== 'object') return res.status(400).json({ error: 'Invalid backup data' });
            for (const [key, value] of Object.entries(backup)) {
                if (key.includes(req.params.guildId)) await db.set(key, value);
            }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/leave', requirePerm(3), async (req, res) => {
        try {
            await req.guild.leave();
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/autoresponder', async (req, res) => {
        try {
            const { trigger, response } = req.body;
            if (!trigger || !response) return res.status(400).json({ error: 'Trigger and response required' });
            const responders = await db.get(`autoresponder_${req.params.guildId}`) || [];
            responders.push({ trigger, response, id: Date.now().toString() });
            await db.set(`autoresponder_${req.params.guildId}`, responders);
            res.json({ success: true, responders });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/autoresponder/:id', async (req, res) => {
        try {
            const { guildId, id } = req.params;
            let responders = await db.get(`autoresponder_${guildId}`) || [];
            responders = responders.filter(r => r.id !== id);
            await db.set(`autoresponder_${guildId}`, responders);
            res.json({ success: true, responders });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/xp/details', async (req, res) => {
        try {
            const guildId = req.params.guildId;
            const multiplier = (await db.get(`xp_multiplier_${guildId}`)) || 1.0;
            const ignoredChannels = (await db.get(`xp_ignored_channels_${guildId}`)) || [];
            const availableChannels = req.guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
            res.json({ multiplier, ignoredChannels, availableChannels });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/xp/advanced', async (req, res) => {
        try {
            const { multiplier, ignoredChannels } = req.body;
            await db.set(`xp_multiplier_${req.params.guildId}`, parseFloat(multiplier) || 1.0);
            await db.set(`xp_ignored_channels_${req.params.guildId}`, ignoredChannels || []);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });


    // ── XP Announce ──────────────────────────────────────────────────────────
    router.get('/xp/announce', async (req, res) => {
        try {
            const cfg = await db.get(`levelup_announce_${req.params.guildId}`);
            res.json({ cfg: cfg === undefined ? null : cfg });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/xp/announce', async (req, res) => {
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
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── XP Role Multipliers ───────────────────────────────────────────────────
    router.get('/xp/rolemultipliers', async (req, res) => {
        try {
            const list = await db.get(`xp_role_multipliers_${req.params.guildId}`) || [];
            res.json(list);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/xp/rolemultipliers', async (req, res) => {
        try {
            const { roleId, value } = req.body;
            if (!roleId || !value) return res.status(400).json({ error: 'roleId and value required' });
            let list = await db.get(`xp_role_multipliers_${req.params.guildId}`) || [];
            list = list.filter(r => r.roleId !== roleId);
            if (parseFloat(value) !== 1) list.push({ roleId, value: parseFloat(value) });
            await db.set(`xp_role_multipliers_${req.params.guildId}`, list);
            res.json(list);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/xp/rolemultipliers/:roleId', async (req, res) => {
        try {
            let list = await db.get(`xp_role_multipliers_${req.params.guildId}`) || [];
            list = list.filter(r => r.roleId !== req.params.roleId);
            await db.set(`xp_role_multipliers_${req.params.guildId}`, list);
            res.json(list);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/webhook-logs', async (req, res) => {
        try {
            const { url } = req.body;
            if (!url) return res.status(400).json({ error: 'URL required' });
            await db.set(`webhook_logs_${req.params.guildId}`, url);
            await sendToWebhook(req.params.guildId, { title: '🛰️ Log Bridge Established', description: `The dashboard audit bridge has been successfully established.\n**Executor:** System`, color: 0x00fbff });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    async function sendToWebhook(guildId, embedData) {
        try {
            const url = await db.get(`webhook_logs_${guildId}`);
            if (!url) return;
            const webhook = new WebhookClient({ url });
            const embed = new EmbedBuilder(embedData).setTimestamp().setFooter({ text: 'EB Bot Audit Log' });
            await webhook.send({ embeds: [embed] });
        } catch (err) { console.error('Webhook fail', err); }
    }

    // ── User Profile (for modal) ──
    router.get('/user/:userId', async (req, res) => {
        try {
            const { guildId, userId } = req.params;
            const member = await req.guild.members.fetch(userId).catch(() => null);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            const xp = await db.get(`xp_${guildId}_${userId}`) || { textLevel: 0, textXp: 0 };
            const stats = await db.get(`stats_${guildId}_${userId}`) || { messages: 0, voiceTime: 0 };
            const warnings = (await db.get(`warnings_${guildId}_${userId}`) || []).length;

            res.json({
                id: member.id,
                username: member.user.username,
                displayName: member.displayName,
                tag: member.user.tag || member.user.username,
                avatar: member.user.displayAvatarURL({ size: 128 }),
                joinedAt: member.joinedAt,
                roles: member.roles.cache
                    .filter(r => r.name !== '@everyone')
                    .map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
                xp,
                stats,
                warnings
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── Growth Chart Data ──
    router.get('/growth', async (req, res) => {
        try {
            const guild = req.guild;
            const now = Date.now();
            const labels = [];
            const data = [];

            for (let i = 6; i >= 0; i--) {
                const d = new Date(now - i * 86400000);
                labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
                // Approximate: use current member count with slight variation for demo
                const variation = Math.floor(Math.random() * 5) - 2;
                data.push(Math.max(0, guild.memberCount + variation - (i * 2)));
            }

            res.json({ labels, data });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ── XP Reset ──
    router.post('/xp/reset', async (req, res) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const xpKeys = allKeys.filter(e => e.id.startsWith(`xp_${guildId}_`));
            const statsKeys = allKeys.filter(e => e.id.startsWith(`stats_${guildId}_`));

            await Promise.all([
                ...xpKeys.map(e => db.delete(e.id)),
                ...statsKeys.map(e => db.delete(e.id))
            ]);

            res.json({ success: true, cleared: xpKeys.length + statsKeys.length });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });


    // Analytics routes
    const _analytics = (() => { try { return require('../../utils/analytics'); } catch(e) { return null; } })();
    router.get('/analytics/chart', (req, res) => {
        try {
            const empty = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: String(i).padStart(2,'0') + ':00', messages: 0, joins: 0, commands: 0 }));
            res.json(_analytics ? _analytics.getChart(req.params.guildId) : empty);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    router.get('/analytics/commands', (req, res) => {
        try { res.json(_analytics ? _analytics.getCommandUsage(req.params.guildId) : { commands: [], total: 0 }); }
        catch (err) { res.status(500).json({ error: err.message }); }
    });
    router.get('/analytics/summary', (req, res) => {
        try { res.json(_analytics ? _analytics.getSummary(req.params.guildId, req.guild) : { messages24h: 0, joins24h: 0, commands24h: 0, onlineCount: 0, totalCommands: 0 }); }
        catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
};
