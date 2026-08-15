const { Events, EmbedBuilder } = require('discord.js');
const { getCached, setCached } = require('../../../database/index');
const config = require('../../../config/bot.json');

const voiceJoinTimes = new Map();

function emitLog(guildId, event) {
    try { require('../../../backend/src/websocket/socket').emitLog(guildId, event); } catch (e) {}
}

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState, client) {
        const actor = newState.member || oldState.member;
        if (actor?.user?.bot) return;
        if (!actor?.user) return;

        const db = client.db;
        const logCfg = await db.get(`logging_${newState.guild.id}`);
        const logChId = logCfg?.voice;

        if (!oldState.channelId && newState.channelId) {
            emitLog(newState.guild.id, {
                type: 'voice_join', category: 'voice', icon: '🎤',
                title: 'Voice Joined',
                description: `${newState.member.user.tag} joined **${newState.channel.name}**`,
                author: { id: newState.member.user.id, tag: newState.member.user.tag, avatar: newState.member.user.displayAvatarURL?.({ size: 32 }) },
                channel: { id: newState.channel.id, name: newState.channel.name },
                guildId: newState.guild.id
            });
        } else if (oldState.channelId && !newState.channelId) {
            emitLog(oldState.guild.id, {
                type: 'voice_leave', category: 'voice', icon: '🔇',
                title: 'Voice Left',
                description: `${oldState.member.user.tag} left **${oldState.channel.name}**`,
                author: { id: oldState.member.user.id, tag: oldState.member.user.tag, avatar: oldState.member.user.displayAvatarURL?.({ size: 32 }) },
                channel: { id: oldState.channel.id, name: oldState.channel.name },
                guildId: oldState.guild.id
            });
        } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            emitLog(newState.guild.id, {
                type: 'voice_move', category: 'voice', icon: '↔️',
                title: 'Voice Channel Switch',
                description: `${newState.member.user.tag} moved from **${oldState.channel.name}** → **${newState.channel.name}**`,
                author: { id: newState.member.user.id, tag: newState.member.user.tag, avatar: newState.member.user.displayAvatarURL?.({ size: 32 }) },
                guildId: newState.guild.id
            });
        }

        if (logChId) {
            const logCh = await newState.guild.channels.fetch(logChId).catch(() => null);
            if (logCh) {
                const embed = new EmbedBuilder().setTimestamp();
                let send = false;

                if (!oldState.channelId && newState.channelId) {
                    embed.setColor(config.colors.success)
                        .setAuthor({ name: 'Voice Joined', iconURL: newState.member.user.displayAvatarURL() })
                        .setDescription(`${newState.member} joined voice channel **${newState.channel.name}**`);
                    send = true;
                } else if (oldState.channelId && !newState.channelId) {
                    embed.setColor(config.colors.error)
                        .setAuthor({ name: 'Voice Left', iconURL: oldState.member.user.displayAvatarURL() })
                        .setDescription(`${oldState.member} left voice channel **${oldState.channel.name}**`);
                    send = true;
                } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                    const moveLogChId = logCfg?.move;
                    const moveLogCh = moveLogChId ? (await newState.guild.channels.fetch(moveLogChId).catch(() => null)) : logCh;
                    if (moveLogCh) {
                        embed.setColor(config.colors.info || '#00fbff')
                            .setAuthor({ name: 'Voice Moved', iconURL: newState.member.user.displayAvatarURL() })
                            .setDescription(`${newState.member} moved from **${oldState.channel.name}** to **${newState.channel.name}**`);
                        if (moveLogCh.id !== logCh.id) { await moveLogCh.send({ embeds: [embed] }); }
                        else { send = true; }
                    }
                }

                const muteLogChId = logCfg?.mute_def;
                const muteLogCh = muteLogChId ? (await newState.guild.channels.fetch(muteLogChId).catch(() => null)) : logCh;
                const activeChannel = newState.channel || oldState.channel;

                if (muteLogCh && activeChannel) {
                    let muteEmbed = new EmbedBuilder().setTimestamp().setColor(config.colors.info || '#00fbff');
                    let muteSend = false;
                    const channelName = activeChannel.name;

                    if (oldState.selfMute !== newState.selfMute) {
                        muteEmbed.setAuthor({ name: newState.selfMute ? 'Self Muted' : 'Self Unmuted', iconURL: newState.member.user.displayAvatarURL() })
                            .setDescription(`${newState.member} ${newState.selfMute ? 'muted' : 'unmuted'} themselves in **${channelName}**`);
                        muteSend = true;
                    } else if (oldState.selfDeaf !== newState.selfDeaf) {
                        muteEmbed.setAuthor({ name: newState.selfDeaf ? 'Self Deafened' : 'Self Undeafened', iconURL: newState.member.user.displayAvatarURL() })
                            .setDescription(`${newState.member} ${newState.selfDeaf ? 'deafened' : 'undeafened'} themselves in **${channelName}**`);
                        muteSend = true;
                    } else if (oldState.serverMute !== newState.serverMute) {
                        muteEmbed.setAuthor({ name: newState.serverMute ? 'Server Muted' : 'Server Unmuted', iconURL: newState.member.user.displayAvatarURL() })
                            .setDescription(`${newState.member} was ${newState.serverMute ? 'server muted' : 'server unmuted'} in **${channelName}**`);
                        muteSend = true;
                    } else if (oldState.serverDeaf !== newState.serverDeaf) {
                        muteEmbed.setAuthor({ name: newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened', iconURL: newState.member.user.displayAvatarURL() })
                            .setDescription(`${newState.member} was ${newState.serverDeaf ? 'server deafened' : 'server undeafened'} in **${channelName}**`);
                        muteSend = true;
                    }
                    if (muteSend) await muteLogCh.send({ embeds: [muteEmbed] });
                }

                if (send) await logCh.send({ embeds: [embed] });
            }
        }

        if (!oldState.channelId && newState.channelId) {
            voiceJoinTimes.set(newState.member.id, Date.now());
        } else if (oldState.channelId && !newState.channelId) {
            const startTime = voiceJoinTimes.get(oldState.member.id);
            if (startTime) {
                const duration = Date.now() - startTime;
                voiceJoinTimes.delete(oldState.member.id);
                const statsKey = `stats_${oldState.guild.id}_${oldState.member.id}`;
                let stats = await getCached(statsKey) || { messages: 0, voiceTime: 0, reactions: 0 };
                stats.voiceTime += duration;
                await setCached(statsKey, stats);
                const xpKey = `xp_${oldState.guild.id}_${oldState.member.id}`;
                let xpData = await getCached(xpKey) || { textXp: 0, textLevel: 1, voiceXp: 0, voiceLevel: 1 };
                xpData.voiceXp = (xpData.voiceXp || 0) + Math.floor(duration / 60000) * 10;
                while (xpData.voiceXp >= xpData.voiceLevel * 100) { xpData.voiceXp -= xpData.voiceLevel * 100; xpData.voiceLevel++; }
                await setCached(xpKey, xpData);
            }
        }
    },
    cleanup() {
        const now = Date.now();
        for (const [userId, startTime] of voiceJoinTimes.entries()) {
            if (now - startTime > 86400000) voiceJoinTimes.delete(userId);
        }
    }
};
