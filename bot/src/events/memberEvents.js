const { Events, EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');
const config = require('../../../config/bot.json');
const logger = require('../../../shared/lib/logger');

function emitLog(guildId, event) {
    try { require('../../../backend/src/websocket/socket').emitLog(guildId, event); } catch (e) {}
}

// Anti-raid: track recent join timestamps per guild
const raidTracker = new Map(); // guildId -> [timestamps]
const RAID_THRESHOLD = 5;   // members
const RAID_WINDOW_MS  = 8000; // within 8 seconds

module.exports = [
    {
        name: Events.GuildMemberAdd,
        async execute(member, client) {
            const db = client.db;
            const welcomeCfg = await db.get(`welcome_${member.guild.id}`);

            try { require('../../../shared/services/analytics').trackJoin(member.guild.id); } catch(e) {}
            try {
                const today = new Date().toISOString().slice(0, 10);
                const key = `growth_${member.guild.id}`;
                const history = (await client.db.get(key)) || [];
                const next = history.filter(p => p.date !== today);
                next.push({ date: today, count: member.guild.memberCount });
                await client.db.set(key, next.slice(-30));
            } catch (e) {}

            // ── Anti-Raid Detection (security.antiRaid, fallback antiraid_*) ─
            const securityCfg = await client.db.get(`security_${member.guild.id}`) || {};
            const legacyRaid = await client.db.get(`antiraid_${member.guild.id}`) || {};
            const raidCfg = { ...legacyRaid, ...(securityCfg.antiRaid || {}) };
            if (raidCfg.enabled) {
                const now = Date.now();
                const threshold = Number(raidCfg.threshold) > 0 ? Number(raidCfg.threshold) : RAID_THRESHOLD;
                const windowMs = Number(raidCfg.windowMs) > 0 ? Number(raidCfg.windowMs) : RAID_WINDOW_MS;
                const times = (raidTracker.get(member.guild.id) || []).filter(t => now - t < windowMs);
                times.push(now);
                raidTracker.set(member.guild.id, times);
                if (times.length >= threshold) {
                    raidTracker.set(member.guild.id, []); // reset burst
                    logger.warn(`[ANTI-RAID] Raid detected in ${member.guild.name} — ${times.length} joins in ${windowMs}ms`);
                    emitLog(member.guild.id, {
                        type: 'raid_detected', category: 'security', icon: '🚨',
                        title: 'Raid Detected',
                        description: `${times.length} members joined within ${windowMs / 1000}s — possible raid`,
                        guildId: member.guild.id
                    });
                    // Alert log channel
                    try {
                        const raidLogCfg = await client.db.get(`logging_${member.guild.id}`) || {};
                        const raidChId = raidCfg.alertChannel || raidLogCfg.security || raidLogCfg.members;
                        if (raidChId) {
                            const raidCh = await member.guild.channels.fetch(raidChId).catch(() => null);
                            if (raidCh) {
                                const raidEmbed = new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('🚨 RAID ALERT')
                                    .setDescription(`**${times.length} members** joined within **${windowMs / 1000} seconds**.\nPossible raid detected — review recent members and consider enabling verification.`)
                                    .addFields({ name: 'Action', value: raidCfg.autoAction === 'lockdown' ? 'Auto-lockdown triggered' : 'Manual review required', inline: false })
                                    .setTimestamp();
                                await raidCh.send({ content: '@here', embeds: [raidEmbed] });
                            }
                        }
                    } catch (e) { logger.error('Raid alert send error', { error: e.message }); }

                    // Optional auto-action
                    if (raidCfg.autoAction === 'lockdown') {
                        try {
                            const channels = member.guild.channels.cache.filter(c => c.isTextBased?.());
                            for (const [, ch] of channels) {
                                await ch.permissionOverwrites.edit(member.guild.roles.everyone, {
                                    [PermissionsBitField.Flags.SendMessages]: false
                                }).catch(() => {});
                            }
                        } catch (e) {}
                    }
                }
            }

            emitLog(member.guild.id, {
                type: 'member_join', category: 'members', icon: '👤',
                title: 'Member Joined',
                description: `${member.user?.tag || member.user?.username || member.id} joined the server (${member.guild.memberCount} members)`,
                author: { id: member.user?.id, tag: member.user?.tag || member.user?.username, avatar: member.user?.displayAvatarURL?.({ size: 32 }) },
                guildId: member.guild.id
            });

            let inviteInfo = 'Unknown';
            try {
                const newInvites = await member.guild.invites.fetch();
                const oldInvites = client.invites.get(member.guild.id);
                const invite = newInvites.find(i => i.uses > (oldInvites?.get(i.code) || 0));
                if (invite) {
                    inviteInfo = `Code: \`${invite.code}\` | Inviter: ${invite.inviter || 'System'}`;
                    client.invites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));
                }
            } catch (err) {
                logger.error(`Invite tracking error in ${member.guild.name}`, { error: err.message });
            }

            if (welcomeCfg && welcomeCfg.enabled && welcomeCfg.channelId) {
                const welcomeCh = await member.guild.channels.fetch(welcomeCfg.channelId).catch(() => null);
                if (welcomeCh) {
                    let msgContent = welcomeCfg.message || 'Welcome {user} to {guild}!';
                    const replaceVars = (str) => str
                        .replace(/{user}/g, String(member))
                        .replace(/{userName}/g, member.user.username)
                        .replace(/{guild}/g, member.guild.name)
                        .replace(/{count}/g, member.guild.memberCount);
                    msgContent = replaceVars(msgContent);
                    const payload = { content: msgContent };

                    // Canvas welcome card (if explicitly enabled via cardEnabled flag)
                    if (welcomeCfg.cardEnabled) {
                        try {
                            const { generateWelcomeCard } = require('../../../shared/utils/welcome-card');
                            const { AttachmentBuilder } = require('discord.js');
                            const cardBuf = await generateWelcomeCard({
                                username:    member.user.username,
                                displayName: member.displayName,
                                avatarURL:   member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                                memberCount: member.guild.memberCount,
                                guildName:   member.guild.name,
                            });
                            payload.files = [new AttachmentBuilder(cardBuf, { name: 'welcome.png' })];
                        } catch (cardErr) {
                            logger.error('Welcome card error', { error: cardErr.message });
                        }
                    }

                    if (welcomeCfg.embed && welcomeCfg.embed.title) {
                        const embedData = welcomeCfg.embed;
                        const embed = new EmbedBuilder().setColor(embedData.color || config.colors.primary);
                        if (embedData.title) embed.setTitle(replaceVars(embedData.title));
                        if (embedData.description) embed.setDescription(replaceVars(embedData.description));
                        if (embedData.footer) embed.setFooter({ text: replaceVars(embedData.footer) });
                        if (embedData.image) embed.setImage(embedData.image);
                        if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
                        if (embedData.fields && Array.isArray(embedData.fields)) {
                            embed.addFields(embedData.fields.map(f => ({ name: replaceVars(f.name), value: replaceVars(f.value), inline: f.inline })));
                        }
                        payload.embeds = [embed];
                    }
                    await welcomeCh.send(payload);
                }
            }

            // DM on join
            if (welcomeCfg && welcomeCfg.dmEnabled && welcomeCfg.dmMessage) {
                try {
                    const replaceVars = (str) => str
                        .replace(/{user}/g, String(member))
                        .replace(/{userName}/g, member.user.username)
                        .replace(/{guild}/g, member.guild.name)
                        .replace(/{count}/g, member.guild.memberCount);
                    await member.user.send(replaceVars(welcomeCfg.dmMessage));
                } catch (dmErr) {
                    logger.warn(`DM welcome failed for ${member.user?.tag || member.id} (DMs likely disabled)`);
                }
            }

            if (welcomeCfg && welcomeCfg.autoRoleId) {
                const role = member.guild.roles.cache.get(welcomeCfg.autoRoleId);
                if (role) await member.roles.add(role).catch(() => {});
            }

            try {
                await require('../../../shared/services/verification').handleJoin(member, db);
            } catch (vErr) {
                logger.error('Verification join handler', { error: vErr.message });
            }

            const logCfg = await db.get(`logging_${member.guild.id}`) || {};
            const logChId = logCfg.members;
            if (!logChId) return;
            const logCh = await member.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('👤 Member Joined')
                .addFields(
                    { name: 'User', value: `${member.user?.tag || member.id} (${member.id})`, inline: true },
                    { name: 'Invite Used', value: inviteInfo, inline: false },
                    { name: 'Account Created', value: member.user?.createdTimestamp ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` : 'Unknown', inline: true }
                )
                .setFooter({ text: `Members: ${member.guild.memberCount}` })
                .setTimestamp();
            const joinAvatar = member.user?.displayAvatarURL?.();
            if (joinAvatar) embed.setThumbnail(joinAvatar);
            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildMemberRemove,
        async execute(member, client) {
            const db = client.db;
            try {
                const today = new Date().toISOString().slice(0, 10);
                const key = `growth_${member.guild.id}`;
                const history = (await db.get(key)) || [];
                const next = history.filter(p => p.date !== today);
                next.push({ date: today, count: member.guild.memberCount });
                await db.set(key, next.slice(-30));
            } catch (e) {}

            try {
                const { clearPending } = require('../../../shared/services/verification');
                await clearPending(db, member.guild.id, member.id);
            } catch { /* ignore */ }

            emitLog(member.guild.id, {
                type: 'member_leave', category: 'members', icon: '🚪',
                title: 'Member Left',
                description: `${member.user?.tag || member.user?.username || member.id} left the server`,
                author: { id: member.user?.id, tag: member.user?.tag || member.user?.username, avatar: member.user?.displayAvatarURL?.({ size: 32 }) },
                guildId: member.guild.id
            });

            const logCfg = await db.get(`logging_${member.guild.id}`) || {};
            const kickLogChId = logCfg.kick || logCfg.moderation;
            const kickLogCh = kickLogChId ? await member.guild.channels.fetch(kickLogChId).catch(() => null) : null;

            if (kickLogCh) {
                try {
                    const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
                    const kickLog = fetchedLogs.entries.first();
                    if (kickLog && kickLog.target?.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
                        const kickedTag = member.user?.tag || member.user?.username || member.id;
                        emitLog(member.guild.id, {
                            type: 'member_kick', category: 'members', icon: '👢',
                            title: 'Member Kicked',
                            description: `${kickedTag} was kicked by ${kickLog.executor?.tag || 'Unknown'}`,
                            author: { id: member.user?.id, tag: kickedTag, avatar: member.user?.displayAvatarURL?.({ size: 32 }) },
                            guildId: member.guild.id
                        });
                        const embed = new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle('👢 Member Kicked')
                            .setThumbnail(member.user?.displayAvatarURL?.() || undefined)
                            .addFields(
                                { name: 'User', value: `${member.user?.tag || member.id} (${member.id})`, inline: true },
                                { name: 'Kicked By', value: `${kickLog.executor?.tag || 'Unknown'}`, inline: true },
                                { name: 'Reason', value: kickLog.reason || 'No reason provided' }
                            )
                            .setTimestamp();
                        await kickLogCh.send({ embeds: [embed] });
                        return;
                    }
                } catch (err) {
                    logger.error(`Kick tracking error in ${member.guild.name}`, { error: err.message });
                }
            }

            const welcomeCfg = await db.get(`welcome_${member.guild.id}`);
            const leaveChId = welcomeCfg?.leaveChannel || (welcomeCfg?.enabled ? welcomeCfg?.channelId : null);
            if (welcomeCfg && welcomeCfg.leaveEnabled && leaveChId) {
                const leaveCh = await member.guild.channels.fetch(leaveChId).catch(() => null);
                if (leaveCh) {
                    let msg = welcomeCfg.leaveMessage || '{user} has left the server.';
                    msg = msg.replace(/{user}/g, member.user?.tag || member.user?.username || member.id).replace(/{guild}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount);
                    await leaveCh.send(msg);
                }
            }

            const leaveLogChId = logCfg.member_leave || logCfg.members;
            const leaveLogCh = leaveLogChId ? await member.guild.channels.fetch(leaveLogChId).catch(() => null) : null;
            if (leaveLogCh) {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle('👤 Member Left')
                    .setThumbnail(member.user?.displayAvatarURL?.() || undefined)
                    .addFields(
                        { name: 'User', value: `${member.user?.tag || member.id} (${member.id})`, inline: true },
                        { name: 'Joined At', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true }
                    )
                    .setFooter({ text: `Members: ${member.guild.memberCount}` })
                    .setTimestamp();
                await leaveLogCh.send({ embeds: [embed] });
            }
        }
    },
    {
        name: Events.InviteCreate,
        async execute(invite, client) {
            const guildInvites = client.invites.get(invite.guild.id) || new Map();
            guildInvites.set(invite.code, invite.uses);
            client.invites.set(invite.guild.id, guildInvites);
            const logCfg = await client.db.get(`logging_${invite.guild.id}`) || {};
            const logChId = logCfg.invites;
            if (!logChId) return;
            const logCh = await invite.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;
            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✉️ Invite Created')
                .addFields(
                    { name: 'Inviter', value: `${invite.inviter?.tag || 'System'}`, inline: true },
                    { name: 'Code', value: `\`${invite.code}\``, inline: true },
                    { name: 'Channel', value: `${invite.channel}`, inline: true },
                    { name: 'Max Uses', value: `${invite.maxUses === 0 ? 'Unlimited' : invite.maxUses}`, inline: true },
                    { name: 'Expires', value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : 'Never', inline: true }
                )
                .setTimestamp();
            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.InviteDelete,
        async execute(invite, client) {
            const guildInvites = client.invites.get(invite.guild.id);
            if (guildInvites) guildInvites.delete(invite.code);
            const logCfg = await client.db.get(`logging_${invite.guild.id}`) || {};
            const logChId = logCfg.invites;
            if (!logChId) return;
            const logCh = await invite.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;
            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('✉️ Invite Deleted')
                .addFields(
                    { name: 'Code', value: `\`${invite.code}\``, inline: true },
                    { name: 'Channel', value: `${invite.channel}`, inline: true }
                )
                .setTimestamp();
            await logCh.send({ embeds: [embed] });
        }
    }
];
