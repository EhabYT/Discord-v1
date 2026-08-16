const logger = require('../lib/logger');
const { finalizeGiveaway } = require('./giveaways');
const { withKeyLock } = require('../../database/lock');

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
          // Serialised against the dashboard's end/reroll routes, which perform
          // the same read-modify-write. Without this a concurrent finalise loses
          // one side's update and the giveaway is drawn twice.
          await withKeyLock(`giveaways_${guildId}`, async () => {
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
          });
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
                            await db.set(`bday_role_${guildId}_${userId}`, Date.now() + 24 * 60 * 60 * 1000);
                        }
                    }

                    logger.info(`[Birthday] Celebrated ${member.user.username} in ${guild.name}`);
                }
            } catch (err) {
                logger.error(`[Birthday] Error in ${guild.name}`, { error: err.message });
            }
        }
    });

    // Expire birthday roles after 24h (survives restarts)
    scheduler.addJob('birthday-roles', 60 * 60 * 1000, async () => {
        const now = Date.now();
        const all = await db.all();
        for (const entry of all.filter(e => e.id.startsWith('bday_role_'))) {
            if (!entry.value || entry.value > now) continue;
            const parts = entry.id.split('_');
            const guildId = parts[2];
            const userId = parts.slice(3).join('_');
            const guild = client.guilds.cache.get(guildId);
            const cfg = await db.get(`birthday_config_${guildId}`);
            if (guild && cfg?.roleId) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) await member.roles.remove(cfg.roleId, 'Birthday role expired').catch(() => {});
            }
            await db.delete(entry.id);
        }
    });

    // Fire due reminders
    scheduler.addJob('reminders', 15000, async () => {
        const now = Date.now();
        const all = await db.all();
        for (const entry of all.filter(e => e.id.startsWith('reminders_'))) {
            const list = Array.isArray(entry.value) ? entry.value : [];
            if (!list.length) continue;
            const remaining = [];
            for (const reminder of list) {
                if (now < reminder.expiresAt) {
                    remaining.push(reminder);
                    continue;
                }
                try {
                    const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
                    const userId = entry.id.replace('reminders_', '');
                    if (channel) {
                        await channel.send({ content: `<@${userId}> ⏰ Reminder: **${reminder.reason}**` });
                    }
                } catch (err) {
                    logger.error('Reminder delivery failed', { error: err.message });
                }
            }
            if (remaining.length !== list.length) {
                await db.set(entry.id, remaining);
            }
        }
    });

    // Performance jobs: Cleanup Maps
    scheduler.addJob('map-cleanup', 3600000, () => {
        try {
            const voiceEvents = require('../../bot/src/events/voiceEvents');
            if (voiceEvents && typeof voiceEvents.cleanup === 'function') {
                voiceEvents.cleanup();
            }

            const messageCreate = require('../../bot/src/events/messageCreate');
            if (messageCreate && typeof messageCreate.cleanup === 'function') {
                messageCreate.cleanup();
            }

            logger.debug('Scheduled cleanup of tracking Maps completed');
        } catch (err) {
            logger.error('Cleanup job error', { error: err.message });
        }
    });

    // Kick members who never finished verification
    scheduler.addJob('verification-kick', 60000, async () => {
        const { kickOverdue } = require('./verification');
        for (const [, guild] of client.guilds.cache) {
            try {
                const { kicked } = await kickOverdue(guild, db);
                if (kicked) logger.info(`[Verify] Auto-kicked ${kicked} unverified in ${guild.name}`);
            } catch (err) {
                logger.error(`[Verify] kick job ${guild.name}`, { error: err.message });
            }
        }
    });

    scheduler.addJob('polls-close', 30000, async () => {
        const { closeExpired } = require('./polls');
        for (const [, guild] of client.guilds.cache) {
            try {
                const n = await closeExpired(guild, db);
                if (n) logger.info(`[Polls] Auto-closed ${n} in ${guild.name}`);
            } catch (err) {
                logger.error(`[Polls] close job ${guild.name}`, { error: err.message });
            }
        }
    });

    // Pick up tunnel URL changes without restarting the bot
    scheduler.addJob('public-url', 15000, async () => {
        try {
            const { readPublicUrl } = require('./public-url');
            const url = readPublicUrl();
            if (!url) return;
            const prev = client._dashboardUrl;
            process.env.DASHBOARD_URL = url;
            process.env.DISCORD_REDIRECT_URI = `${url}/api/auth/discord/callback`;
            if (prev === url) return;
            client._dashboardUrl = url;
            if (!prev) return;
            logger.info(`Dashboard public URL changed: ${url}`);
            // Was hardcoded to the original author's Discord ID as a fallback,
            // which silently DM'd YOUR public dashboard URL to a third party on
            // every tunnel rotation. Now notifies nobody unless you opt in.
            const ownerId = process.env.OWNER_ID;
            if (!ownerId) return;
            const user = await client.users.fetch(ownerId).catch(() => null);
            if (user) {
                await user.send(`Dashboard-Link erneuert (alter Tunnel tot):\n${url}`).catch(() => {});
            }
        } catch (err) {
            logger.error('public-url job', { error: err.message });
        }
    });
}

module.exports = { registerJobs };
