const logger = require('../utils_logger');
const { finalizeGiveaway } = require('./giveaway_service');

function registerJobs(client, scheduler) {
    const db = client.db;

    // Timed Bans Job
    scheduler.addJob('timed-bans', 60000, async () => {
        for (const [guildId, guild] of client.guilds.cache) {
            const bans = await db.get(`tempbans_${guildId}`) || [];
            const now = Date.now();
            const remainingBans = [];

            for (const ban of bans) {
                if (now >= ban.expiresAt) {
                    try {
                        await guild.members.unban(ban.userId, 'Tempban expired');
                        logger.info(`Auto-unbanned ${ban.userId} from ${guild.name}`);
                    } catch (err) {
                        logger.error(`Auto-unban fail: ${ban.userId}`, { error: err.message });
                    }
                } else {
                    remainingBans.push(ban);
                }
            }

            if (remainingBans.length !== bans.length) {
                await db.set(`tempbans_${guildId}`, remainingBans);
            }
        }
    });

    // Giveaways Job
    scheduler.addJob('giveaways', 10000, async () => {
        for (const [guildId, guild] of client.guilds.cache) {
            const giveaways = await db.get(`giveaways_${guildId}`) || [];
            const now = Date.now();
            const updatedGiveaways = [];
            let changed = false;

            for (const giveaway of giveaways) {
                if (!giveaway.active) {
                    updatedGiveaways.push(giveaway);
                    continue;
                }

                if (now >= giveaway.endsAt) {
                    try {
                        await finalizeGiveaway(guild, giveaway, logger);
                        changed = true;
                    } catch (err) {
                        logger.error('Giveaway end error', { error: err.message });
                    }
                }
                updatedGiveaways.push(giveaway);
            }

            if (changed) {
                await db.set(`giveaways_${guildId}`, updatedGiveaways);
            }
        }
    });


    // Birthday Job — runs every hour, fires celebrations once per day per user
    scheduler.addJob('birthdays', 3600000, async () => {
        const now   = new Date();
        const month = now.getMonth() + 1;
        const day   = now.getDate();
        const todayKey = `${now.getFullYear()}-${month}-${day}`;

        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const cfg = await db.get(`birthday_config_${guildId}`);
                if (!cfg || cfg.disabled || !cfg.channelId) continue;

                const ch = await guild.channels.fetch(cfg.channelId).catch(() => null);
                if (!ch) continue;

                const all     = await db.all();
                const prefix  = `birthday_${guildId}_`;
                const entries = all.filter(e =>
                    e.id.startsWith(prefix) &&
                    e.value?.month === month &&
                    e.value?.day   === day
                );

                for (const entry of entries) {
                    const userId     = entry.id.replace(prefix, '');
                    const alreadyKey = `bday_wished_${guildId}_${userId}_${todayKey}`;

                    if (await db.get(alreadyKey)) continue;
                    await db.set(alreadyKey, true);

                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;

                    let msgText = cfg.message || "🎉 {user} it's your birthday today! Happy Birthday! 🎂";
                    msgText = msgText
                        .replace(/{user}/g, String(member))
                        .replace(/{name}/g, member.user.username);

                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setColor('#FF69B4')
                        .setTitle(`🎂 Happy Birthday, ${member.displayName}!`)
                        .setDescription(msgText)
                        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                        .addFields({ name: '🎊 Celebrating', value: `**${member.user.username}'s** birthday today!` })
                        .setTimestamp();

                    await ch.send({ embeds: [embed] });

                    if (cfg.roleId) {
                        const role = guild.roles.cache.get(cfg.roleId);
                        if (role) {
                            await member.roles.add(role, 'Birthday role').catch(() => {});
                            setTimeout(async () => {
                                await member.roles.remove(role, 'Birthday role expired').catch(() => {});
                            }, 24 * 60 * 60 * 1000);
                        }
                    }

                    logger.info(`[Birthday] Celebrated ${member.user.username} in ${guild.name}`);
                }
            } catch (err) {
                logger.error(`[Birthday] Error in ${guild.name}`, { error: err.message });
            }
        }
    });

    // Performance jobs: Cleanup Maps
    scheduler.addJob('map-cleanup', 3600000, () => {
        try {
            const voiceEvents = require('../events/voiceEvents');
            if (voiceEvents && typeof voiceEvents.cleanup === 'function') {
                voiceEvents.cleanup();
            }

            const messageCreate = require('../events/messageCreate');
            if (messageCreate && typeof messageCreate.cleanup === 'function') {
                messageCreate.cleanup();
            }

            logger.debug('Scheduled cleanup of tracking Maps completed');
        } catch (err) {
            logger.error('Cleanup job error', { error: err.message });
        }
    });
}

module.exports = { registerJobs };
