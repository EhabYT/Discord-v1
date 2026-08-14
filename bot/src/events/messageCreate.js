const { Events, EmbedBuilder } = require('discord.js');
const { hasModPerms } = require('../../../shared/utils/discord');
const config = require('../../../config/bot.json');
const logger = require('../../../shared/lib/logger');
const { getCached, setCached } = require('../../../database/index');

// These would normally be in a separate file or handled by a more robust anti-spam system
const spamTracker = new Map();
const xpCooldowns = new Map(); // userId_guildId -> last XP award timestamp
const XP_COOLDOWN_MS = 60 * 1000; // 60 seconds between XP awards

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;
        try { require('../../../shared/services/analytics').trackMessage(message.guild.id); } catch(e) {}
        const db = client.db;

        try {
            const selfKey = `afk_${message.guild.id}_${message.author.id}`;
            const selfAfk = await db.get(selfKey);
            if (selfAfk) {
                await db.delete(selfKey);
                await message.reply({ content: `👋 Welcome back ${message.author}, I removed your AFK.` }).then(m => {
                    setTimeout(() => m.delete().catch(() => {}), 8000);
                }).catch(() => {});
            }
            const mentioned = [...message.mentions.users.values()].slice(0, 5);
            for (const user of mentioned) {
                if (user.id === message.author.id) continue;
                const afk = await db.get(`afk_${message.guild.id}_${user.id}`);
                if (!afk) continue;
                await message.reply({
                    content: `💤 **${user.username}** is AFK: ${afk.reason} · <t:${Math.floor(afk.since / 1000)}:R>`
                }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
                break;
            }
        } catch (e) {}

        // Stats & XP (using cache for speed)
        const sK = `stats_${message.guild.id}_${message.author.id}`;
        let s = await getCached(sK) || { messages: 0, voiceTime: 0, reactions: 0 };
        s.messages++;
        await setCached(sK, s);

        // XP System (Respect Global Toggle & Phase 18 Advanced Controls)
        const xpEnabled = await getCached(`xp_enabled_${message.guild.id}`) !== false;
        if (xpEnabled) {
            // Check Excluded Channels
            const ignoredChannels = await getCached(`xp_ignored_channels_${message.guild.id}`) || [];
            if (!ignoredChannels.includes(message.channel.id)) {
                const xpCooldownKey = `${message.author.id}_${message.guild.id}`;
                const lastXP = xpCooldowns.get(xpCooldownKey) || 0;
                const onXpCooldown = Date.now() - lastXP < XP_COOLDOWN_MS;
                if (!onXpCooldown) xpCooldowns.set(xpCooldownKey, Date.now());
                const xK = `xp_${message.guild.id}_${message.author.id}`;
                if (!onXpCooldown) {
                let xD = await getCached(xK) || { textXp: 0, textLevel: 1, voiceXp: 0, voiceLevel: 1 };

                // Apply Multiplier (global + per-role, highest wins)
                const globalMult = await getCached(`xp_multiplier_${message.guild.id}`) || 1.0;
                const roleMultList = await getCached(`xp_role_multipliers_${message.guild.id}`) || [];
                let roleMult = 1.0;
                if (roleMultList.length > 0) {
                    for (const rm of roleMultList) {
                        if (message.member.roles.cache.has(rm.roleId)) {
                            roleMult = Math.max(roleMult, rm.value);
                        }
                    }
                }
                const multiplier = Math.max(globalMult, roleMult);
                const baseXP = Math.floor(Math.random() * 10) + 5;
                xD.textXp += Math.floor(baseXP * multiplier);

                if (xD.textXp >= xD.textLevel * 100) {
                    xD.textXp -= xD.textLevel * 100;
                    xD.textLevel++;

                    // Phase 4: Level Role Rewards
                    const rewards = await getCached(`rewards_${message.guild.id}`) || [];
                    const reward = rewards.find(r => r.level === xD.textLevel);
                    if (reward) {
                        try {
                            const role = message.guild.roles.cache.get(reward.roleId);
                            if (role) await message.member.roles.add(role);
                        } catch (e) { }
                    }

                    // Level-up announcement
                    try {
                        const lvlUpCfg = await getCached(`levelup_announce_${message.guild.id}`);
                        if (lvlUpCfg !== false) {
                            const announceChId = (lvlUpCfg && lvlUpCfg.channelId) || message.channel.id;
                            const announceCh = announceChId === message.channel.id
                                ? message.channel
                                : await message.guild.channels.fetch(announceChId).catch(() => message.channel);
                            if (announceCh) {
                                const lvlEmbed = new EmbedBuilder()
                                    .setColor('#00FFFF')
                                    .setDescription([
                                        `⚡ **Level Up!** ${message.author}`,
                                        `You reached **Level ${xD.textLevel}**!`,
                                        reward ? `\n🎁 Role reward: <@&${reward.roleId}>` : ''
                                    ].join('\n').trim())
                                    .setThumbnail(message.author.displayAvatarURL())
                                    .setTimestamp();
                                const lvlMsg = await announceCh.send({ embeds: [lvlEmbed] });
                                setTimeout(() => lvlMsg.delete().catch(() => {}), 30000);
                            }
                        }
                    } catch (e) {}
                }
                await setCached(xK, xD);
                }
            }
        }

        // AutoMod — skip checks for empty config, mods, and whitelist, but still run auto-responder
        const autoModCfg = await getCached(`automod_${message.guild.id}`) || {};
        const wl = await getCached(`automod_whitelist_${message.guild.id}`) || { users: [], roles: [], channels: [] };
        const skipAutomod = Object.keys(autoModCfg).length === 0
            || hasModPerms(message.member)
            || wl.users.includes(message.author.id)
            || wl.channels.includes(message.channel.id)
            || message.member.roles.cache.some(r => wl.roles.includes(r.id));

        if (skipAutomod) {
            // fall through to auto-responder
        } else {

        let violation = null;
        let violationType = null;

        // 1. Anti-Spam
        if (autoModCfg.antiSpam) {
            const k = `${message.guild.id}_${message.author.id}`;
            const now = Date.now();
            let msgTimes = spamTracker.get(k) || [];
            msgTimes.push(now);
            const recent = msgTimes.filter(t => now - t < 5000);
            spamTracker.set(k, recent);
            if (recent.length > 5) { // Default threshold
                violation = `Spam (${recent.length} in 5s)`;
                violationType = 'spam';
            }
        }

        // 2. Bad Words
        if (!violation && autoModCfg.badWords) {
            if (config.profanity.some(word => message.content.toLowerCase().includes(word))) {
                violation = 'Profanity';
                violationType = 'profanity';
            }
        }

        // 3. Anti-Invite (Discord invite links)
        if (!violation && autoModCfg.antiInvite) {
            const inviteRegex = /discord(?:\.gg|(?:app)?\.com\/invite)\/[\w-]+/gi;
            if (inviteRegex.test(message.content)) {
                violation = 'Discord Invite Link';
                violationType = 'invite';
            }
        }

        // 4. Anti-Links (bulk URL spam)
        if (!violation && autoModCfg.antiLinks) {
            const links = message.content.match(/https?:\/\/[^\s]+/gi) || [];
            if (links.length > 3) {
                violation = `Links (${links.length})`;
                violationType = 'links';
            }
        }

        // 5. Caps Control
        const caps = autoModCfg.caps;
        if (!violation && caps?.enabled && message.content.length > 10) {
            const capsCount = message.content.replace(/[^A-Z]/g, '').length;
            const threshold = caps.threshold || 70;
            if (capsCount / message.content.length > threshold / 100) {
                violation = 'CAPS';
                violationType = 'caps';
            }
        }

        // 6. Emoji Spam
        const emojisCfg = autoModCfg.emojis;
        if (!violation && emojisCfg?.enabled) {
            const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|<a?:\w+:\d+>)/gu;
            const emojis = message.content.match(emojiRegex) || [];
            const threshold = emojisCfg.threshold || 10;
            if (emojis.length > threshold) {
                violation = `Emojis (${emojis.length})`;
                violationType = 'emojis';
            }
        }

        // 7. Mention Spam
        const mentionsCfg = autoModCfg.mentions;
        if (!violation && mentionsCfg?.enabled) {
            const mentionsCount = message.mentions.users.size + message.mentions.roles.size;
            const threshold = mentionsCfg.threshold || 5;
            if (message.mentions.everyone || mentionsCount > threshold) {
                violation = 'Mentions';
                violationType = 'mentions';
            }
        }

        // 8. Custom Filters
        if (!violation) {
            const customFilters = await getCached(`custom_filters_${message.guild.id}`) || [];
            const lowContent = message.content.toLowerCase();
            for (const pattern of customFilters) {
                if (lowContent.includes(pattern.toLowerCase())) {
                    violation = `Custom Filter (${pattern})`;
                    violationType = 'custom';
                    break;
                }
            }
        }

        if (violation) {
            try {
                await message.delete();
                const vK = `automod_violations_${message.guild.id}_${message.author.id}`;
                let vcount = (await db.get(vK)) || 0;
                vcount++;
                await db.set(vK, vcount);

                const embed = new EmbedBuilder()
                    .setColor(config.colors.warning)
                    .setTitle(' AutoMod Warning')
                    .setDescription(`${message.author}, your message was removed.\n**Reason:** ${violation}`)
                    .setFooter({ text: `Violations: ${vcount}/3` })
                    .setTimestamp();

                const warnMsg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => warnMsg.delete().catch(() => { }), 10000);

                if (vcount >= 3) {
                    try {
                        await message.member.timeout(10 * 60 * 1000, 'AutoMod violations');
                        await db.set(vK, 0);
                        const timeoutEmbed = new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle(' AutoMod Timeout')
                            .setDescription(`${message.author} timed out (10m) for 3 violations.`)
                            .setTimestamp();
                        const timeoutMsg = await message.channel.send({ embeds: [timeoutEmbed] });
                        setTimeout(() => timeoutMsg.delete().catch(() => { }), 30000);
                    } catch (e) { }
                }
                logger.automod(violationType, message.author, message.guild, { viol: violation, vcount: vcount });
            } catch (e) { }
            return; // Don't process responders if violation occurred
        }
        }

        // 9. Auto-Responder
        try {
            const responders = await getCached(`autoresponder_${message.guild.id}`) || [];
            if (responders.length > 0) {
                const content = message.content.toLowerCase();
                for (const r of responders) {
                    // Simple keyword match or basic regex if we want to be fancy later
                    const needle = (r.trigger || '').toLowerCase();
                    if (!needle) continue;
                    const hit = r.exact ? content === needle : content.includes(needle);
                    if (hit) {
                        await message.reply(r.response);
                        break; // Only one response per message to avoid spam
                    }
                }
            }
        } catch (e) {
            logger.error('AutoResponder error', { error: e.message });
        }
    },
    cleanup() {
        const now = Date.now();
        for (const [key, times] of spamTracker.entries()) {
            const recent = times.filter(t => now - t < 5000);
            if (recent.length === 0) {
                spamTracker.delete(key);
            } else {
                spamTracker.set(key, recent);
            }
        }
        for (const [key, ts] of xpCooldowns.entries()) {
            if (now - ts > XP_COOLDOWN_MS * 5) xpCooldowns.delete(key);
        }
    }
};
