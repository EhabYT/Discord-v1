const express = require('express');
const router = express.Router({ mergeParams: true });
const { db, databaseConfigIssue } = require('eb-bot-database');
const { EmbedBuilder, WebhookClient, PermissionsBitField } = require('discord.js');
const { sessionUserId } = require('../middleware/auth');
const guildAccess = require('../middleware/guild-access');
const { SYSTEM_ROLES, requireSystemRole } = require('../middleware/devauth');
const rl = require('../middleware/rate-limit');
const logger = require('eb-bot-shared/lib/logger');
const registerAnalyticsRoutes = require('./guilds/analytics');
const registerBoardRoutes = require('./guilds/board');
const registerVerificationRoutes = require('./guilds/verification');
const registerGiveawaysRoutes = require('./guilds/giveaways');
const registerMembersRoutes = require('./guilds/members');
const registerCommunityRoutes = require('./guilds/community');
const registerTicketsRoutes = require('./guilds/tickets');

/** Strict http(s) URL check for Discord embed fields (setURL/setImage/... throw shapeshift 500s otherwise). */
function isHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

module.exports = (botClient) => {
    // Guard implementations live in middleware/guildAccess.js so that EVERY
    // guild-scoped router shares one definition. They were previously closures
    // here, which is why routes/permissions.js — mounted on a more specific
    // path and therefore matched first — inherited none of them and shipped
    // unauthenticated. Two copies of a security rule is how the next
    // divergence happens.
    const requirePerm = (minLevel) => guildAccess.requirePerm(botClient, minLevel);
    const hierarchyError = guildAccess.hierarchyError;
    // The bot-nickname section of Bot Controls is developer-only, like the
    // global presence endpoints in server.js.
    const developerOnly = requireSystemRole(botClient, SYSTEM_ROLES.DEVELOPER);

    // Apply validation to all routes in this router.
    // requirePerm(0) makes every route — including GETs — require a session.
    // Order matters: authenticate BEFORE resolving the guild, so an anonymous
    // caller cannot distinguish a real guild (401) from an unknown one (404).
    router.use(guildAccess.guildAccessStack(botClient, 0));

    router.get('/', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const guild = req.guild;

            // Without a configured database the reads below hit the ephemeral
            // in-memory fallback (empty until this session writes something).
            // A configured-but-unreachable database still fails closed, so a
            // real outage is never masked as empty configuration.
            const databaseOnline = !databaseConfigIssue();
            // Single round-trip batch fetch: 11 parallel `db.get` calls occupied
            // up to 11 pool slots (pool default is 5, so 6 queued) on every
            // dashboard overview load. `mget` serves the same keys with one
            // indexed `WHERE key = ANY($1)` query.
            const batch = await db.mget([
                `automod_${guildId}`,
                `welcome_${guildId}`,
                `logging_${guildId}`,
                `djrole_${guildId}`,
                `xp_enabled_${guildId}`,
                `giveaways_${guildId}`,
                `commands_enabled_${guildId}`,
                `tickets_${guildId}`,
                `rewards_${guildId}`,
                `custom_filters_${guildId}`,
                `autoresponder_${guildId}`,
            ]);
            const automod = batch[`automod_${guildId}`];
            const welcome = batch[`welcome_${guildId}`];
            const logging = batch[`logging_${guildId}`];
            const djrole = batch[`djrole_${guildId}`];
            const xpEnabled = batch[`xp_enabled_${guildId}`];
            const giveaways = batch[`giveaways_${guildId}`];
            const commandsEnabled = batch[`commands_enabled_${guildId}`];
            const ticketsRaw = batch[`tickets_${guildId}`];
            const rewards = batch[`rewards_${guildId}`];
            const customFilters = batch[`custom_filters_${guildId}`];
            const autoresponder = batch[`autoresponder_${guildId}`];
            let tickets = ticketsRaw;
            if (!tickets) {
                const legacy = await db.get(`ticket_config_${guildId}`);
                if (legacy) {
                    tickets = legacy;
                    try { await db.set(`tickets_${guildId}`, legacy); } catch { /* ignore migrate error */ }
                }
            }

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
                databaseOnline,
                degraded: !databaseOnline,
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
                        .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position })),
                    botHighestPosition: botMember?.roles.highest.position ?? 0,
                    botCanManageRoles: botMember ? botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) : false
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
            const filterPrefix = type === 'xp' ? `xp_${guildId}_` : `stats_${guildId}_`;

            // Database-side top-15: previously every call transferred the full
            // prefix (up to 50,000 JSONB rows) to sort 15 in JavaScript.
            // topPrefix ranks in Postgres and returns 15 rows. Unknown types
            // keep the legacy unsorted first-15 behavior byte-for-byte.
            let entries = [];
            if (type === 'xp' || type === 'messages' || type === 'voice') {
                const rows = await db.topPrefix(filterPrefix, { sort: type, limit: 15 });
                entries = rows.map(e => ({ userId: e.id.replace(filterPrefix, ''), ...e.value }));
            } else {
                const all = await db.allByPrefix(filterPrefix);
                entries = all
                    .map(e => ({ userId: e.id.replace(filterPrefix, ''), ...e.value }))
                    .slice(0, 15);
            }

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
            const prefix = `warnings_${guildId}_`;
            const allKeys = await db.allByPrefix(prefix);
            const warnings = allKeys
                .flatMap(e => (e.value || []).map((w, i) => ({
                    userId: e.id.replace(`warnings_${guildId}_`, ''),
                    ...w,
                    id: w.id || String(w.timestamp || i),
                })));
            // Optional bounded mode for old guilds: ?limit=N returns the N most
            // recent warnings instead of the full history. No parameter means
            // the legacy full list, byte-identical to before.
            const limit = Number.parseInt(req.query.limit, 10);
            if (Number.isFinite(limit) && limit > 0) {
                warnings.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                return res.json(warnings.slice(0, Math.min(limit, 2000)));
            }
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
                db.allByPrefix(`warnings_${guildId}_`)
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

    // Verification routes live in ./guilds/verification.js (second extraction
    // of the monolithic router). Registered here — not at the bottom with
    // analytics — so Express matching order is byte-identical to before.
    registerVerificationRoutes(router, { requirePerm, rl, hierarchyError });

    const rr = require('eb-bot-shared/services/reaction-roles');

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

    // Community routes live in ./guilds/community.js (fifth extraction).
    registerCommunityRoutes(router, { requirePerm, botClient });

    // Staff-board routes live in ./guilds/board.js (first extraction of the
    // monolithic router). Registered here — not at the bottom with analytics —
    // so Express matching order is byte-identical to before the split.
    registerBoardRoutes(router, { requirePerm, rl });

    // Ticket routes live in ./guilds/tickets.js (sixth extraction).
    registerTicketsRoutes(router, { requirePerm, rl });

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

    router.post('/config', requirePerm(3), developerOnly, async (req, res, next) => {
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

    // Giveaway routes live in ./guilds/giveaways.js (fourth extraction).
    registerGiveawaysRoutes(router, { requirePerm });

    // Member routes live in ./guilds/members.js (third extraction).
    registerMembersRoutes(router, { requirePerm, rl, hierarchyError, sessionUserId });

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

    router.post('/nickname', requirePerm(3), developerOnly, async (req, res, next) => {
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

    // POST /welcome/test — send a test welcome message to a channel
    router.post('/welcome/test', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
        try {
            const { channelId } = req.body;
            const guild = req.guild;
            const config = await db.get(`welcome_${req.params.guildId}`) || {};
            const channel = channelId ? guild.channels.cache.get(channelId) : null;
            if (!channel) return res.status(400).json({ error: 'Channel not found' });
            const member = guild.members.me;
            const { formatWelcomeVars } = require('eb-bot-shared/utils/welcome-vars');
            const msg = formatWelcomeVars(config.message || 'Welcome {user} to {guild}!', { member });
            await channel.send({ content: `**[Test Welcome]** ${msg}` });
            res.json({ success: true });
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

            // Discord builder validation throws (HTTP 500 + full stack in the
            // logs) on the first bad value. Reject bad input here with 400.
            const urlFields = { titleUrl, authorIconUrl, footerIconUrl, image, thumbnail };
            for (const [name, value] of Object.entries(urlFields)) {
                if (value != null && value !== '' && !isHttpUrl(value)) {
                    return res.status(400).json({ error: `Invalid ${name}: must be an http(s) URL` });
                }
            }
            if (title != null && String(title).length > 256) {
                return res.status(400).json({ error: 'Title must be 256 characters or fewer' });
            }
            if (description != null && String(description).length > 4096) {
                return res.status(400).json({ error: 'Description must be 4096 characters or fewer' });
            }
            if (author != null && String(author).length > 256) {
                return res.status(400).json({ error: 'Author name must be 256 characters or fewer' });
            }
            if (footer != null && String(footer).length > 2048) {
                return res.status(400).json({ error: 'Footer text must be 2048 characters or fewer' });
            }
            if (color != null && color !== '') {
                try { require('discord.js').resolveColor(color); } catch {
                    return res.status(400).json({ error: 'Invalid color: use #rrggbb, a 0-16777215 number, or a color name' });
                }
            }
            if (Array.isArray(fields)) {
                if (fields.length > 25) return res.status(400).json({ error: 'At most 25 fields are allowed' });
                for (const field of fields) {
                    if (field && (String(field.name || '').length > 256 || String(field.value || '').length > 1024)) {
                        return res.status(400).json({ error: 'Field names allow 256 and values 1024 characters' });
                    }
                }
            }

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

    router.get('/backup', requirePerm(3), developerOnly, rl.heavyRead(), async (req, res, next) => {
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

    router.post('/restore', requirePerm(3), developerOnly, rl.restore(), async (req, res, next) => {
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

    router.post('/leave', requirePerm(3), developerOnly, async (req, res, next) => {
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

    router.post('/webhook-logs', requirePerm(3), developerOnly, async (req, res, next) => {
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
            const [xpCount, statsCount] = await Promise.all([
                db.deletePrefix(`xp_${guildId}_`),
                db.deletePrefix(`stats_${guildId}_`),
            ]);

            res.json({ success: true, cleared: xpCount + statsCount });
        } catch (err) { next(err); }
    });

    // Domain modules register on this already-protected router so the global
    // guild access stack and route ordering remain authoritative.
    registerAnalyticsRoutes(router);

    return router;
};
