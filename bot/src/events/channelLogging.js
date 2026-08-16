const { Events, EmbedBuilder } = require('discord.js');
const config = require('../../../config/bot.json');

module.exports = [
    {
        name: Events.ChannelCreate,
        async execute(channel, client) {
            if (!channel.guild) return;
            const cfg = await client.db.get(`logging_${channel.guild.id}`) || {};
            if (!cfg.channels) return;

            const logCh = await channel.guild.channels.fetch(cfg.channels).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle(' Channel Created')
                .addFields(
                    { name: 'Channel', value: `${channel} (${channel.name})`, inline: true },
                    { name: 'Type', value: String(channel.type), inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.ChannelDelete,
        async execute(channel, client) {
            if (!channel.guild) return;
            const cfg = await client.db.get(`logging_${channel.guild.id}`) || {};
            const logChId = cfg.channel_delete || cfg.channels;
            if (!logChId) return;

            const logCh = await channel.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(' Channel Deleted')
                .addFields(
                    { name: 'Channel', value: channel.name, inline: true },
                    { name: 'Type', value: String(channel.type), inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    }
];
