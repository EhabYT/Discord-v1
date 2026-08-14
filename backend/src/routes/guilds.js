const express = require('express');
const router = express.Router({ mergeParams: true });
const { db } = require('../../../database/index');
const { EmbedBuilder, WebhookClient, PermissionsBitField } = require('discord.js');
const { getUserPermLevel } = require('../middleware/permissions');
const { sessionUserId } = require('../middleware/auth');
const guildAccess = require('../middleware/guild-access');
const rl = require('../middleware/rate-limit');
const { withKeyLock } = require('../../../database/lock');
const logger = require('../../../shared/lib/logger');
const { ENTRY_REACTION, finalizeGiveaway, rerollGiveaway } = require('../../../shared/services/giveaways');

module.exports = (botClient) => {
    // Guard implementations live in middleware/guildAccess.js so that EVERY
    // guild-scoped router shares one definition. They were previously closures
    // here, which is why routes/permissions.js — mounted on a more specific
    // path and therefore matched first — inherited none of them and shipped
    // unauthenticated. Two copies of a security rule is how the next
    // divergence happens.
    const requirePerm = (minLevel) => guildAccess.requirePerm(botClient, minLevel);
    const hierarchyError = guildAccess.hierarchyError;

    // Apply validation to all routes in this router.
    // requirePerm(0) makes every route — including GETs — require a session.
    // Order matters: authenticate BEFORE resolving the guild, so an anonymous
    // caller cannot distinguish a real guild (401) from an unknown one (404).
    router.use(guildAccess.guildAccessStack(botClient, 0));

    router.get('/', async (req, res, next) => {
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
                    botNickname: botMember?.nickname || null,
                    botDisplayName: botMember?.displayName || botClient.user?.username || 'EB',
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
        } catch (err) { next(err); }
    });

    router.get('/leaderboard', async (req, res, next) => {
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

            const enrichedEntries = await Promise.all(entries.map(async (entry) => {
                const user = await botClient.users.fetch(entry.userId).catch(() => null);
                return {
                    ...entry,
                    username: user ? user.username : entry.userId,
                    avatar: user ? user.displayAvatarURL({ size: 32 }) : null,
                };
            }));

            res.json(enrichedEntries);
        } catch (err) { next(err); }
    });

    router.get('/warnings', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const warnings = allKeys
                .filter(e => e.id.startsWith(`warnings_${guildId}_`))
                .flatMap(e => (e.value || []).map((w, i) => ({
                    userId: e.id.replace(`warnings_${guildId}_`, ''),
                    ...w,
                    id: w.id || String(w.timestamp || i),
                })));
            res.json(warnings);
        } catch (err) { next(err); }
    });

    router.get('/activity', async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    router.post('/automod', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const { setting, value, threshold } = req.body;
            const validSettings = ['antiSpam', 'antiLinks', 'antiInvite', 'badWords', 'caps', 'emojis', 'mentions'];
            if (!validSettings.includes(setting)) return res.status(400).json({ error: 'Invalid setting' });

            const automod = await db.get(`automod_${guildId}`) || {};
            if (['antiSpam', 'antiLinks', 'antiInvite', 'badWords'].includes(setting)) {
                automod[setting] = !!value;
            } else {
                if (!automod[setting]) automod[setting] = { enabled: false, threshold: 5 };
                if (typeof value !== 'undefined') automod[setting].enabled = !!value;
                if (typeof threshold !== 'undefined') automod[setting].threshold = parseInt(threshold);
            }
            await db.set(`automod_${guildId}`, automod);
            res.json({ automod });
        } catch (err) { next(err); }
    });

    router.post('/welcome', requirePerm(3), async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    const verify = require('../../../shared/services/verification');

    router.get('/verification', async (req, res, next) => {
        try {
            const config = await verify.getConfig(db, req.params.guildId);
            res.json(config);
        } catch (err) { next(err); }
    });

    router.get('/verification/overview', async (req, res, next) => {
        try {
            res.json(await verify.overview(req.guild, db));
        } catch (err) { next(err); }
    });

    router.get('/verification/pending', async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            res.json(await verify.listPending(req.guild, db, cfg));
        } catch (err) { next(err); }
    });

    router.get('/verification/log', async (req, res, next) => {
        try {
            res.json(await verify.getLog(db, req.params.guildId));
        } catch (err) { next(err); }
    });

    router.post('/verification', requirePerm(3), async (req, res, next) => {
        try {
            const current = await verify.getConfig(db, req.params.guildId);
            const body = req.body || {};
            const merged = { ...current, ...body };
            if (body.logChannelId && !body.channelId && !current.channelId) {
                merged.channelId = body.logChannelId;
            }
            const saved = await verify.saveConfig(db, req.params.guildId, merged);
            res.json(saved);
        } catch (err) { next(err); }
    });

    router.post('/verification/panel', requirePerm(3), rl.botMessaging(), async (req, res, next) => {
        try {
            const current = await verify.getConfig(db, req.params.guildId);
            if (!current.roleId && !req.body.roleId) {
                return res.status(400).json({ error: 'Set a verified role first' });
            }
            const cfg = verify.defaults({
                ...current,
                title: req.body.title ?? current.title,
                description: req.body.description ?? current.description,
                buttonLabel: req.body.buttonLabel ?? current.buttonLabel,
                buttonEmoji: req.body.buttonEmoji ?? current.buttonEmoji,
                buttonStyle: req.body.buttonStyle ?? current.buttonStyle,
                embedColor: req.body.embedColor ?? current.embedColor,
                rulesText: req.body.rulesText ?? current.rulesText,
                requireRules: typeof req.body.requireRules === 'boolean' ? req.body.requireRules : current.requireRules,
                mode: req.body.mode ?? current.mode,
                showGuildIcon: typeof req.body.showGuildIcon === 'boolean' ? req.body.showGuildIcon : current.showGuildIcon,
            });
            const channelId = req.body.channelId || cfg.channelId || cfg.logChannelId;
            const result = await verify.postPanel(req.guild, cfg, channelId);
            cfg.channelId = result.channelId;
            cfg.messageId = result.messageId;
            cfg.enabled = true;
            await verify.saveConfig(db, req.params.guildId, cfg);
            res.json({ success: true, ...result });
        } catch (err) { next(err); }
    });

    router.post('/verification/members/:userId/verify', requirePerm(2), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            if (!cfg.roleId) return res.status(400).json({ error: 'Set a verified role first' });
            const member = await req.guild.members.fetch(req.params.userId).catch(() => null);
            if (!member) return res.status(404).json({ error: 'Member not found' });
            const actor = req.session?.user?.username || 'Dashboard';
            const entry = await verify.applyVerification(member, cfg, { db, method: 'staff', actor });
            res.json({ success: true, entry });
        } catch (err) { next(err); }
    });

    router.post('/verification/members/:userId/unverify', requirePerm(2), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            const member = await req.guild.members.fetch(req.params.userId).catch(() => null);
            if (!member) return res.status(404).json({ error: 'Member not found' });
            const actor = req.session?.user?.username || 'Dashboard';
            await verify.revokeVerification(member, cfg, { db, actor });
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/verification/kick-pending', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            const map = await verify.getPendingMap(db, req.params.guildId);
            const overdueOnly = req.body?.overdueOnly !== false;
            const now = Date.now();
            // Bulk moderation guard rails. This loop previously ran uncapped over
            // every pending entry, issuing one Discord kick per iteration with no
            // hierarchy check — so an Admin could sweep out moderators, and a large
            // pending list would burn the bot's global rate limit inside a single
            // request. Cap the batch, respect hierarchy, and report what was skipped.
            const MAX_KICKS = 50;
            let kicked = 0;
            let skipped = 0;
            let remaining = 0;
            for (const [userId, info] of Object.entries(map)) {
                if (overdueOnly && info?.kickAt && info.kickAt > now) continue;
                if (overdueOnly && !info?.kickAt) continue;
                if (kicked >= MAX_KICKS) { remaining += 1; continue; }
                const member = await req.guild.members.fetch(userId).catch(() => null);
                if (member && !verify.isVerified(member, cfg) && !verify.hasBypass(member, cfg)) {
                    // Never let a bulk sweep do what a single action would refuse.
                    if (await hierarchyError(req, member)) { skipped += 1; continue; }
                    if (member.kickable === false) { skipped += 1; continue; }
                    const ok = await member.kick(overdueOnly ? 'Did not verify in time' : 'Kicked unverified (dashboard)').catch(() => null);
                    if (ok) kicked += 1;
                }
                delete map[userId];
            }
            await verify.setPendingMap(db, req.params.guildId, map);
            res.json({ success: true, kicked, skipped, remaining });
        } catch (err) { next(err); }
    });

    router.delete('/verification/log', requirePerm(3), async (req, res, next) => {
        try {
            await verify.clearLog(db, req.params.guildId);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/verification/roles', requirePerm(3), async (req, res, next) => {
        try {
            const which = ['verified', 'unverified', 'both'].includes(req.body?.which) ? req.body.which : 'both';
            const created = await verify.createRoles(req.guild, {
                which,
                verifiedName: req.body?.verifiedName,
                unverifiedName: req.body?.unverifiedName,
            });
            const cfg = await verify.getConfig(db, req.params.guildId);
            if (created.verified) cfg.roleId = created.verified.id;
            if (created.unverified) cfg.unverifiedRoleId = created.unverified.id;
            const saved = await verify.saveConfig(db, req.params.guildId, cfg);
            res.json({ success: true, created, config: saved });
        } catch (err) { next(err); }
    });

    router.post('/verification/lock', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            if (req.body?.channelId) cfg.channelId = req.body.channelId;
            if (req.body?.enable === false) {
                await verify.removeGateLock(req.guild, cfg);
                cfg.lockApplied = false;
                cfg.lockedChannelIds = [];
                const saved = await verify.saveConfig(db, req.params.guildId, cfg);
                return res.json({ success: true, locked: false, config: saved });
            }
            const ids = await verify.applyGateLock(req.guild, cfg);
            cfg.lockApplied = true;
            cfg.lockedChannelIds = ids;
            cfg.enabled = true;
            const saved = await verify.saveConfig(db, req.params.guildId, cfg);
            res.json({ success: true, locked: true, channels: ids.length, config: saved });
        } catch (err) { next(err); }
    });

    router.post('/verification/quick-setup', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            let cfg = await verify.getConfig(db, req.params.guildId);
            if (req.body?.channelId) cfg.channelId = req.body.channelId;
            if (req.body?.mode) cfg.mode = req.body.mode === 'captcha' ? 'captcha' : 'button';
            if (!cfg.roleId || !cfg.unverifiedRoleId) {
                const created = await verify.createRoles(req.guild, {
                    which: !cfg.roleId && !cfg.unverifiedRoleId ? 'both' : (!cfg.roleId ? 'verified' : 'unverified'),
                });
                if (created.verified) cfg.roleId = created.verified.id;
                if (created.unverified) cfg.unverifiedRoleId = created.unverified.id;
            }
            if (!cfg.channelId) return res.status(400).json({ error: 'Pick a panel channel first' });
            if (!cfg.roleId) return res.status(400).json({ error: 'Could not create verified role' });
            cfg.enabled = true;
            if (req.body?.lockServer) {
                cfg.lockedChannelIds = await verify.applyGateLock(req.guild, cfg);
                cfg.lockApplied = true;
            }
            const panel = await verify.postPanel(req.guild, cfg, cfg.channelId);
            cfg.messageId = panel.messageId;
            cfg.channelId = panel.channelId;
            const saved = await verify.saveConfig(db, req.params.guildId, cfg);
            res.json({ success: true, panel, config: saved });
        } catch (err) { next(err); }
    });

    const rr = require('../../../shared/services/reaction-roles');

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
        } catch (err) { next(err); }
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
            const all = await db.all();
            const prefix = `birthday_${guildId}_`;
            const today = new Date();
            const todayM = today.getMonth() + 1;
            const todayD = today.getDate();
            const entries = all
                .filter((e) => e.id.startsWith(prefix) && e.value && e.value.month)
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

    const suggestions = require('../../../shared/services/suggestions');
    const polls = require('../../../shared/services/polls');
    const tags = require('../../../shared/services/tags');
    const confessions = require('../../../shared/services/confessions');
    const board = require('../../../shared/services/staff-board');

    router.get('/suggestions', async (req, res, next) => {
        try {
            const items = await suggestions.list(db, req.params.guildId);
            const config = await suggestions.getConfig(db, req.params.guildId);
            // /suggest offers "anonymous — hide your username", and the posted embed
            // honours it. The dashboard must honour it too: strip identity from
            // anonymous suggestions below Moderator, or the promise is hollow.
            const level = await getUserPermLevel(botClient, req.params.guildId, sessionUserId(req));
            const visible = level >= 2
                ? [...items].reverse()
                : [...items].reverse().map((s) => (s.anonymous
                    ? (({ authorId, authorTag, ...rest }) => rest)(s)
                    : s));
            res.json({
                items: visible,
                config,
                pending: items.filter((s) => s.status === 'pending').length,
            });
        } catch (err) { next(err); }
    });

    router.post('/suggestions/config', requirePerm(3), async (req, res, next) => {
        try {
            const current = await suggestions.getConfig(db, req.params.guildId);
            const saved = await suggestions.saveConfig(db, req.params.guildId, { ...current, ...(req.body || {}) });
            res.json(saved);
        } catch (err) { next(err); }
    });

    router.post('/suggestions', requirePerm(2), async (req, res, next) => {
        try {
            const item = await suggestions.create(req.guild, db, {
                message: req.body?.message,
                anonymous: !!req.body?.anonymous,
                channelId: req.body?.channelId,
                authorId: req.session?.user?.id || 'dashboard',
                authorTag: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.post('/suggestions/:id/approve', requirePerm(2), async (req, res, next) => {
        try {
            const item = await suggestions.setStatus(req.guild, db, req.params.id, 'approved', {
                note: req.body?.note,
                reviewedBy: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.post('/suggestions/:id/deny', requirePerm(2), async (req, res, next) => {
        try {
            const item = await suggestions.setStatus(req.guild, db, req.params.id, 'denied', {
                note: req.body?.note,
                reviewedBy: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.delete('/suggestions/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await suggestions.remove(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.get('/polls', async (req, res, next) => {
        try {
            const list = await polls.list(db, req.params.guildId);
            const enriched = [];
            for (const p of [...list].reverse()) {
                const liveResults = p.closed ? (p.results || []) : await polls.tally(req.guild, p).catch(() => p.options || []);
                enriched.push({ ...p, liveResults });
            }
            res.json({ polls: enriched, open: list.filter((p) => !p.closed).length });
        } catch (err) { next(err); }
    });

    router.post('/polls', requirePerm(2), async (req, res, next) => {
        try {
            const poll = await polls.create(req.guild, db, {
                channelId: req.body?.channelId,
                question: req.body?.question,
                options: req.body?.options,
                durationMs: req.body?.durationMs,
                authorId: req.session?.user?.id || 'dashboard',
                authorTag: req.session?.user?.username || 'Dashboard',
            });
            res.json(poll);
        } catch (err) { next(err); }
    });

    router.post('/polls/:id/close', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await polls.close(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/polls/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await polls.remove(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.get('/tags', async (req, res, next) => {
        try {
            res.json({ tags: await tags.list(db, req.params.guildId) });
        } catch (err) { next(err); }
    });

    router.post('/tags', requirePerm(2), async (req, res, next) => {
        try {
            const item = await tags.upsert(db, req.params.guildId, req.body?.name, req.body?.content, req.session?.user?.id || 'dashboard');
            res.json(item);
        } catch (err) { next(err); }
    });

    router.delete('/tags/:name', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await tags.remove(db, req.params.guildId, req.params.name));
        } catch (err) { next(err); }
    });

    router.get('/confessions', async (req, res, next) => {
        try {
            const config = await confessions.getConfig(db, req.params.guildId);
            const items = [...(await confessions.list(db, req.params.guildId))].reverse();
            // Confessions are anonymous by design. authorId/authorTag are only
            // retained when staffLog is enabled, and must not be handed to every
            // dashboard Viewer — strip them below Moderator (level 2).
            const level = await getUserPermLevel(botClient, req.params.guildId, sessionUserId(req));
            const safe = level >= 2
                ? items
                : items.map(({ authorId, authorTag, ...rest }) => rest);
            res.json({ items: safe, config });
        } catch (err) { next(err); }
    });

    router.post('/confessions/config', requirePerm(3), async (req, res, next) => {
        try {
            const current = await confessions.getConfig(db, req.params.guildId);
            res.json(await confessions.saveConfig(db, req.params.guildId, { ...current, ...(req.body || {}) }));
        } catch (err) { next(err); }
    });

    router.post('/confessions', requirePerm(2), async (req, res, next) => {
        try {
            const item = await confessions.create(req.guild, db, {
                message: req.body?.message,
                channelId: req.body?.channelId,
                skipCooldown: true,
                authorId: req.session?.user?.id || 'dashboard',
                authorTag: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.delete('/confessions/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await confessions.remove(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.get('/board', async (req, res, next) => {
        try {
            const [announcements, afk, reminders] = await Promise.all([
                board.listAnnouncements(db, req.params.guildId),
                board.listAfk(req.guild, db),
                board.listReminders(req.guild, db),
            ]);
            res.json({
                announcements: [...announcements].reverse(),
                afk,
                reminders,
            });
        } catch (err) { next(err); }
    });

    router.post('/board/announce', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
        try {
            res.json(await board.postAnnouncement(req.guild, db, {
                ...(req.body || {}),
                authorTag: req.session?.user?.username || 'Dashboard',
            }));
        } catch (err) { next(err); }
    });

    router.delete('/board/announce/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.deleteAnnouncement(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/board/afk/:userId', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.clearAfk(db, req.params.guildId, req.params.userId));
        } catch (err) { next(err); }
    });

    router.post('/board/reminders', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.addReminder(req.guild, db, {
                ...(req.body || {}),
                userId: req.session?.user?.id || 'dashboard',
            }));
        } catch (err) { next(err); }
    });

    router.delete('/board/reminders/:userId/:index', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.cancelReminder(db, req.params.userId, Number(req.params.index)));
        } catch (err) { next(err); }
    });

    // GET /tickets — list open tickets
    router.get('/tickets', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const tickets = allKeys
                .filter(e => e.id.startsWith(`ticket_${guildId}_`))
                .map(e => ({ id: e.id.replace(`ticket_${guildId}_`, ''), ...e.value }));
            res.json(tickets);
        } catch (err) { next(err); }
    });

    router.get('/logging', async (req, res, next) => {
        try {
            const logging = await db.get(`logging_${req.params.guildId}`) || {};
            res.json(logging);
        } catch (err) { next(err); }
    });

    router.post('/logging', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const { type, channelId } = req.body;
            const validTypes = ['messages', 'msg_delete', 'bulk_delete', 'members', 'moderation', 'channels', 'voice', 'invites', 'mute_def', 'server_update', 'unban', 'role_update', 'member_leave', 'move', 'kick', 'role_delete', 'channel_delete', 'ban'];
            if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid log type' });

            const logging = await db.get(`logging_${guildId}`) || {};
            logging[type] = channelId || null;
            await db.set(`logging_${guildId}`, logging);
            res.json(logging);
        } catch (err) { next(err); }
    });

    router.post('/config', requirePerm(3), async (req, res, next) => {
        try {
            const { xpEnabled, autoresponder, djRoleId } = req.body;
            if (typeof xpEnabled !== 'undefined') {
                await db.set(`xp_enabled_${req.params.guildId}`, !!xpEnabled);
            }
            if (Array.isArray(autoresponder)) {
                await db.set(`autoresponder_${req.params.guildId}`, autoresponder);
            }
            if (typeof djRoleId !== 'undefined') {
                await db.set(`djrole_${req.params.guildId}`, djRoleId || null);
            }
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.get('/commands', async (req, res, next) => {
        try {
            const enabled = await db.get(`commands_enabled_${req.params.guildId}`) || {};
            const list = [];
            if (botClient?.commands) {
                for (const [name, cmd] of botClient.commands) {
                    let json = {};
                    try { json = cmd.data.toJSON(); } catch { /* ignore */ }
                    const opts = json.options || [];
                    const subs = opts.filter((o) => o.type === 1).map((o) => ({
                        name: o.name,
                        description: o.description || '',
                    }));
                    const groups = opts.filter((o) => o.type === 2).map((o) => ({
                        name: o.name,
                        description: o.description || '',
                        subs: (o.options || []).filter((s) => s.type === 1).map((s) => ({
                            name: s.name,
                            description: s.description || '',
                        })),
                    }));
                    list.push({
                        name,
                        description: json.description || '',
                        enabled: enabled[name] !== false,
                        subs,
                        groups,
                    });
                }
            }
            list.sort((a, b) => a.name.localeCompare(b.name));
            res.json({ commands: list, enabled, total: list.length });
        } catch (err) { next(err); }
    });

    router.get('/giveaways', async (req, res, next) => {
        try {
            const giveaways = (await db.get(`giveaways_${req.params.guildId}`) || [])
                .sort((a, b) => (b.createdAt || b.endsAt || 0) - (a.createdAt || a.endsAt || 0));
            res.json(giveaways.map(g => ({ ...g, id: g.messageId })));
        } catch (err) { next(err); }
    });

    router.post('/giveaways/create', requirePerm(2), async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    router.post('/giveaways/:id/end', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, id } = req.params;
            // Read-modify-write on giveaways_<guild>. The scheduler runs the same
            // sequence every 10s, so without the lock one side's write is lost and
            // a finalised giveaway stays active — it is then drawn a second time
            // and the prize is awarded twice.
            const result = await withKeyLock(`giveaways_${guildId}`, async () => {
                const giveaways = await db.get(`giveaways_${guildId}`) || [];
                const giveaway = giveaways.find(g => g.messageId === id && g.active);
                if (!giveaway) return null;
                await finalizeGiveaway(req.guild, giveaway, logger);
                await db.set(`giveaways_${guildId}`, giveaways);
                return giveaway;
            });
            if (!result) return res.status(404).json({ error: 'Active giveaway not found' });
            res.json({ success: true, giveaway: { ...result, id: result.messageId } });
        } catch (err) { next(err); }
    });

    router.post('/giveaways/:id/reroll', requirePerm(2), async (req, res, next) => {
        try {
            const { id } = req.params;
            const giveaways = await db.get(`giveaways_${req.params.guildId}`) || [];
            const giveaway = giveaways.find(g => g.messageId === id && !g.active);
            if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

            const winner = await rerollGiveaway(req.guild, giveaway);
            await db.set(`giveaways_${req.params.guildId}`, giveaways);
            res.json({ success: true, winnerId: winner, giveaway: { ...giveaway, id: giveaway.messageId } });
        } catch (err) { next(err); }
    });

    router.delete('/giveaways/:id', requirePerm(2), async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    router.get('/members', async (req, res, next) => {
        try {
            const query = (req.query.q || '').toLowerCase();
            let members = req.guild.members.cache;
            if (members.size < Math.min(req.guild.memberCount || 2, 5)) {
                try {
                    members = await Promise.race([
                        req.guild.members.fetch(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
                    ]);
                } catch {
                    members = req.guild.members.cache;
                }
            }
            if (query) {
                members = members.filter(m => m.user.username.toLowerCase().includes(query) || (m.nickname && m.nickname.toLowerCase().includes(query)) || m.id.includes(query));
            }
            if (req.query.staff === '1') {
                members = members.filter(m => !m.user.bot && m.permissions.has(PermissionsBitField.Flags.ManageMessages));
            }
            const limit = req.query.staff === '1' ? 100 : 50;
            const data = members.first(limit).map(m => ({
                id: m.id,
                username: m.user.username,
                displayName: m.displayName,
                avatar: m.user.displayAvatarURL({ size: 64 }),
                joinedAt: m.joinedAt,
                roles: m.roles.cache.size - 1,
                isStaff: m.permissions.has(PermissionsBitField.Flags.ManageMessages),
                isBot: !!m.user.bot,
                timedOut: !!(m.communicationDisabledUntil && m.communicationDisabledUntil > Date.now()),
                highestRole: m.roles.highest && m.roles.highest.name !== '@everyone' ? m.roles.highest.name : null,
            }));
            res.json(data);
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/action', requirePerm(2), async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { action, reason, duration } = req.body;
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            // Note actions are record-keeping only; everything else touches the user.
            if (action !== 'note') {
                const hErr = await hierarchyError(req, member);
                if (hErr) return res.status(403).json({ error: hErr, code: 'HIERARCHY' });
            }

            if (action === 'kick') await member.kick(reason || 'Dashboard Action');
            else if (action === 'ban') await member.ban({ reason: reason || 'Dashboard Action' });
            else if (action === 'softban') {
                await member.ban({ deleteMessageSeconds: 86400, reason: reason || 'Dashboard softban' });
                await req.guild.members.unban(userId, reason || 'Dashboard softban');
            }
            else if (action === 'timeout') await member.timeout(duration || 60000, reason || 'Dashboard Action');
            else if (action === 'untimeout') await member.timeout(null, reason || 'Dashboard unmute');
            else if (action === 'nickname') {
                const nick = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : '';
                if (nick.length > 32) return res.status(400).json({ error: 'Nickname must be 32 characters or less' });
                await member.setNickname(nick || null, reason || 'Dashboard nickname');
            }
            else if (action === 'warn') {
                const { randomUUID } = require('crypto');
                const warnings = await db.get(`warnings_${req.params.guildId}_${userId}`) || [];
                warnings.push({
                    id: randomUUID().split('-')[0],
                    // Bound both the entry and the list: `reason` was unbounded, so a
                    // 100 kb body became a 100 kb record, and the array itself never
                    // stopped growing. Keep the most recent 200.
                    reason: String(reason || 'Dashboard Action').slice(0, 500),
                    moderator: req.session?.user?.username || 'Dashboard',
                    timestamp: Date.now(),
                });
                await db.set(`warnings_${req.params.guildId}_${userId}`, warnings.slice(-200));
            } else {
                return res.status(400).json({ error: 'Unknown action' });
            }
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    function normalizeNotes(list) {
        return (list || []).map((n, i) => ({
            id: n.id || `legacy-${n.ts || n.timestamp || i}`,
            text: n.text,
            mod: n.mod || n.moderator || 'Unknown',
            ts: n.ts || n.timestamp || 0,
        }));
    }

    router.get('/notes', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const notes = allKeys
                .filter(e => e.id.startsWith(`notes_${guildId}_`))
                .flatMap(e => normalizeNotes(e.value || []).map(n => ({
                    userId: e.id.replace(`notes_${guildId}_`, ''),
                    ...n,
                })))
                .sort((a, b) => (b.ts || 0) - (a.ts || 0));
            res.json(notes);
        } catch (err) { next(err); }
    });

    router.get('/members/:userId/notes', async (req, res, next) => {
        try {
            const list = await db.get(`notes_${req.params.guildId}_${req.params.userId}`) || [];
            res.json(normalizeNotes(list));
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/notes', requirePerm(2), async (req, res, next) => {
        try {
            const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
            if (!text) return res.status(400).json({ error: 'Note text required' });
            if (text.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or less' });
            const { randomUUID } = require('crypto');
            const key = `notes_${req.params.guildId}_${req.params.userId}`;
            const list = normalizeNotes(await db.get(key) || []);
            list.push({
                id: randomUUID().split('-')[0],
                text,
                mod: req.session?.user?.username || 'Dashboard',
                ts: Date.now(),
            });
            const capped = list.slice(-200);   // text was bounded, the list was not
            await db.set(key, capped);
            res.json(capped);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/notes/:noteId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `notes_${req.params.guildId}_${req.params.userId}`;
            const list = normalizeNotes(await db.get(key) || []).filter(n => n.id !== req.params.noteId);
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/notes', requirePerm(2), async (req, res, next) => {
        try {
            await db.set(`notes_${req.params.guildId}_${req.params.userId}`, []);
            res.json([]);
        } catch (err) { next(err); }
    });

    router.patch('/members/:userId/warnings/:warningId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `warnings_${req.params.guildId}_${req.params.userId}`;
            const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
            if (!reason) return res.status(400).json({ error: 'Reason required' });
            const list = (await db.get(key) || []).map((w, i) => {
                const id = w.id || String(w.timestamp || i);
                return id === req.params.warningId ? { ...w, id, reason } : w;
            });
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/warnings/:warningId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `warnings_${req.params.guildId}_${req.params.userId}`;
            const list = (await db.get(key) || []).filter((w, i) => {
                const id = w.id || String(w.timestamp || i);
                return id !== req.params.warningId;
            });
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/warnings', requirePerm(2), async (req, res, next) => {
        try {
            await db.set(`warnings_${req.params.guildId}_${req.params.userId}`, []);
            res.json([]);
        } catch (err) { next(err); }
    });

    router.delete('/warnings', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.all();
            const keys = allKeys.filter(e => e.id.startsWith(`warnings_${guildId}_`));
            await Promise.all(keys.map(e => db.set(e.id, [])));
            res.json({ success: true, cleared: keys.length });
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/roles', requirePerm(3), async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { roles } = req.body;
            if (!Array.isArray(roles)) return res.status(400).json({ error: 'roles must be an array' });
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            const hErr = await hierarchyError(req, member);
            if (hErr) return res.status(403).json({ error: hErr, code: 'HIERARCHY' });

            // Privilege escalation guard: roles.set() previously accepted ANY role id,
            // so a level-3 dashboard user could grant themselves or others a role above
            // their own — or a managed/integration role the bot must not touch.
            const botTop = req.guild.members.me?.roles.highest.position ?? 0;
            const actorId = sessionUserId(req);
            let actorTop = Infinity;   // localhost dev bypass has no Discord identity
            if (actorId && actorId !== req.guild.ownerId) {
                const actor = await req.guild.members.fetch(actorId).catch(() => null);
                actorTop = actor ? actor.roles.highest.position : 0;
            }
            for (const rid of roles) {
                const role = req.guild.roles.cache.get(String(rid));
                if (!role) return res.status(400).json({ error: `Unknown role: ${rid}` });
                if (role.managed) return res.status(403).json({ error: `${role.name} is managed by an integration`, code: 'MANAGED_ROLE' });
                if (role.position >= botTop) return res.status(403).json({ error: `${role.name} is above the bot's highest role`, code: 'HIERARCHY' });
                if (role.position >= actorTop) return res.status(403).json({ error: `${role.name} is at or above your highest role`, code: 'HIERARCHY' });
            }

            await member.roles.set(roles);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

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

    router.post('/nickname', requirePerm(3), async (req, res, next) => {
        try {
            const me = req.guild.members.me;
            if (!me) return res.status(503).json({ error: 'Bot member not available' });
            const raw = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : '';
            if (raw.length > 32) return res.status(400).json({ error: 'Nickname must be 32 characters or less' });
            await me.setNickname(raw || null);
            res.json({
                success: true,
                nickname: me.nickname || null,
                displayName: me.displayName,
            });
        } catch (err) { next(err); }
    });

    router.post('/automod/custom', requirePerm(2), async (req, res, next) => {
        try {
            const { pattern } = req.body;
            if (!pattern) return res.status(400).json({ error: 'Missing pattern' });
            const filters = await db.get(`custom_filters_${req.params.guildId}`) || [];
            if (!filters.includes(pattern)) {
                filters.push(pattern);
                await db.set(`custom_filters_${req.params.guildId}`, filters);
            }
            res.json(filters);
        } catch (err) { next(err); }
    });

    router.post('/automod/custom/delete', requirePerm(2), async (req, res, next) => {
        try {
            const { pattern } = req.body;
            let filters = await db.get(`custom_filters_${req.params.guildId}`) || [];
            filters = filters.filter(f => f !== pattern);
            await db.set(`custom_filters_${req.params.guildId}`, filters);
            res.json(filters);
        } catch (err) { next(err); }
    });

    router.post('/tickets', requirePerm(3), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const { categoryId, transcriptChannelId, supportRoleId, maxOpen } = req.body;
            const config = await db.get(`tickets_${guildId}`) || { categoryId: null, transcriptChannelId: null };
            if (categoryId !== undefined) {
                config.categoryId = categoryId;
                config.category = categoryId;
            }
            if (transcriptChannelId !== undefined) {
                config.transcriptChannelId = transcriptChannelId;
                config.logChannel = transcriptChannelId;
            }
            if (supportRoleId !== undefined) {
                config.supportRoleId = supportRoleId;
                config.supportRole = supportRoleId;
            }
            if (maxOpen !== undefined) config.maxOpen = maxOpen;
            await db.set(`tickets_${guildId}`, config);
            res.json(config);
        } catch (err) { next(err); }
    });

    // POST /welcome/test — send a test welcome message to a channel
    router.post('/welcome/test', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    // POST /tickets/panel — post a ticket button panel embed in a channel
    router.post('/tickets/panel', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
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
                    .setCustomId('create_ticket')
                    .setLabel('Open Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫')
            );
            await channel.send({ embeds: [embed], components: [row] });
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    // POST /tickets/:ticketId/close — mark a ticket closed
    router.post('/tickets/:ticketId/close', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, ticketId } = req.params;
            const key = `ticket_${guildId}_${ticketId}`;
            const ticket = await db.get(key);
            if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
            ticket.status = 'closed';
            ticket.closedAt = Date.now();
            await db.set(key, ticket);
            const channelId = ticket.channelId || ticket.channel || ticketId;
            const channel = await req.guild.channels.fetch(channelId).catch(() => null);
            if (channel) await channel.delete('Closed from dashboard').catch(() => {});
            res.json({ success: true, ticket });
        } catch (err) { next(err); }
    });

    router.post('/embed', requirePerm(3), rl.botMessaging(), async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    // ── Security Config (Anti-Raid / Anti-Spam) ──
    router.get('/security', async (req, res, next) => {
        try {
            const config = await db.get(`security_${req.params.guildId}`) || {};
            res.json(config);
        } catch (err) { next(err); }
    });

    router.post('/security', requirePerm(3), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const { antiRaid, antiSpam } = req.body;
            const config = await db.get(`security_${guildId}`) || {};
            if (antiRaid) config.antiRaid = { ...config.antiRaid, ...antiRaid };
            if (antiSpam) config.antiSpam = { ...config.antiSpam, ...antiSpam };
            await db.set(`security_${guildId}`, config);
            res.json(config);
        } catch (err) { next(err); }
    });

    router.post('/commands/toggle', requirePerm(3), async (req, res, next) => {
        try {
            const { commandName, enabled } = req.body;
            if (!commandName) return res.status(400).json({ error: 'Missing command name' });
            const current = await db.get(`commands_enabled_${req.params.guildId}`) || {};
            current[commandName] = !!enabled;
            await db.set(`commands_enabled_${req.params.guildId}`, current);
            res.json(current);
        } catch (err) { next(err); }
    });

    // Admin-only: a backup is a full configuration dump. It previously sat at

    // level 0, handing Viewers confessions_* (with author ids) and every

    // security/automod setting — routing around the redaction on /confessions.

    router.get('/backup', requirePerm(3), rl.heavyRead(), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const keys = [
                `settings_${guildId}`, `logging_${guildId}`, `welcome_${guildId}`, `verification_${guildId}`,
                `toggles_${guildId}`, `autoroles_${guildId}`, `ticket_config_${guildId}`, `tickets_${guildId}`,
                `automod_${guildId}`, `security_${guildId}`, `commands_enabled_${guildId}`, `xp_enabled_${guildId}`,
                `xp_multiplier_${guildId}`, `rewards_${guildId}`, `custom_filters_${guildId}`, `autoresponder_${guildId}`,
                `djrole_${guildId}`, `birthday_config_${guildId}`, `suggestion_config_${guildId}`, `suggestions_${guildId}`, `polls_${guildId}`,
                `tags_${guildId}`, `confession_config_${guildId}`, `confessions_${guildId}`, `announcements_${guildId}`,
            ];
            const backup = {};
            for (const key of keys) backup[key] = await db.get(key);
            res.json(backup);
        } catch (err) { next(err); }
    });

    router.post('/restore', requirePerm(3), rl.restore(), async (req, res, next) => {
        try {
            const backup = req.body;
            if (!backup || typeof backup !== 'object' || Array.isArray(backup)) return res.status(400).json({ error: 'Invalid backup data' });
            // key.includes(guildId) was a substring test: a key belonging to another
            // guild whose id merely contains this one would be overwritten. Require an
            // exact `<prefix>_<thisGuildId>` shape and skip prototype-polluting keys.
            const gid = String(req.params.guildId);
            const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
            let restored = 0;
            for (const [key, value] of Object.entries(backup)) {
                if (!FORBIDDEN.has(key) && key.endsWith(`_${gid}`) && typeof value !== 'undefined') { await db.set(key, value); restored += 1; }
            }
            res.json({ success: true, restored });
        } catch (err) { next(err); }
    });

    router.post('/leave', requirePerm(3), async (req, res, next) => {
        try {
            await req.guild.leave();
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/autoresponder', requirePerm(2), async (req, res, next) => {
        try {
            const { trigger, response } = req.body;
            if (!trigger || !response) return res.status(400).json({ error: 'Trigger and response required' });
            const responders = await db.get(`autoresponder_${req.params.guildId}`) || [];
            responders.push({ trigger, response, exact: !!req.body.exact, id: Date.now().toString() });
            await db.set(`autoresponder_${req.params.guildId}`, responders);
            res.json({ success: true, responders });
        } catch (err) { next(err); }
    });

    router.delete('/autoresponder/:id', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, id } = req.params;
            let responders = await db.get(`autoresponder_${guildId}`) || [];
            responders = responders.filter(r => r.id !== id);
            await db.set(`autoresponder_${guildId}`, responders);
            res.json({ success: true, responders });
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

    router.post('/webhook-logs', requirePerm(3), async (req, res, next) => {
        try {
            const { url } = req.body;
            if (!url) return res.status(400).json({ error: 'URL required' });
            await db.set(`webhook_logs_${req.params.guildId}`, url);
            await sendToWebhook(req.params.guildId, { title: '🛰️ Log Bridge Established', description: `The dashboard audit bridge has been successfully established.\n**Executor:** System`, color: 0x00fbff });
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    async function sendToWebhook(guildId, embedData) {
        try {
            const url = await db.get(`webhook_logs_${guildId}`);
            if (!url) return;
            const webhook = new WebhookClient({ url });
            const embed = new EmbedBuilder(embedData).setTimestamp().setFooter({ text: 'EB Bot Audit Log' });
            await webhook.send({ embeds: [embed] });
        } catch (err) { logger.error('Webhook fail', { error: err.message }); }
    }

    // ── User Profile (for modal) ──
    router.get('/user/:userId', async (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    // ── Growth Chart Data ──
    router.get('/growth', async (req, res, next) => {
        try {
            const guild = req.guild;
            const key = `growth_${guild.id}`;
            const today = new Date().toISOString().slice(0, 10);
            let history = (await db.get(key)) || [];

            if (!history.find(p => p.date === today)) {
                history.push({ date: today, count: guild.memberCount });
                history = history.slice(-30);
                await db.set(key, history);
            } else {
                history = history.map(p => p.date === today ? { ...p, count: guild.memberCount } : p);
                await db.set(key, history);
            }

            const last7 = history.slice(-7);
            res.json({
                labels: last7.map(p => new Date(p.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' })),
                data: last7.map(p => p.count)
            });
        } catch (err) { next(err); }
    });

    // ── XP Reset ──
    router.post('/xp/reset', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
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
        } catch (err) { next(err); }
    });


    // Analytics routes
    const _analytics = (() => { try { return require('../../../shared/services/analytics'); } catch(e) { return null; } })();
    router.get('/analytics/chart', (req, res, next) => {
        try {
            const empty = Array.from({ length: 24 }, (_, i) => ({ hour: i, label: String(i).padStart(2,'0') + ':00', messages: 0, joins: 0, commands: 0 }));
            res.json(_analytics ? _analytics.getChart(req.params.guildId) : empty);
        } catch (err) { next(err); }
    });
    router.get('/analytics/commands', (req, res, next) => {
        try { res.json(_analytics ? _analytics.getCommandUsage(req.params.guildId) : { commands: [], total: 0 }); }
        catch (err) { next(err); }
    });
    router.get('/analytics/summary', (req, res, next) => {
        try { res.json(_analytics ? _analytics.getSummary(req.params.guildId, req.guild) : { messages24h: 0, joins24h: 0, commands24h: 0, onlineCount: 0, totalCommands: 0 }); }
        catch (err) { next(err); }
    });

    return router;
};
