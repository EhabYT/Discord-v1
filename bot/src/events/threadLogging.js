const { Events, EmbedBuilder } = require('discord.js');
const config = require('../../../config/bot.json');

module.exports = [
    {
        name: Events.ThreadCreate,
        async execute(thread, client) {
            const logCfg = await client.db.get(`logging_${thread.guild.id}`);
            if (!logCfg || !logCfg.threads) return;

            const logCh = await thread.guild.channels.fetch(logCfg.threads).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('🧵 Thread Created')
                .addFields(
                    { name: 'Thread', value: `${thread} (${thread.name})`, inline: true },
                    { name: 'Parent', value: thread.parent?.name || 'Unknown', inline: true },
                    { name: 'Type', value: String(thread.type), inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.ThreadDelete,
        async execute(thread, client) {
            const logCfg = await client.db.get(`logging_${thread.guild.id}`);
            if (!logCfg || !logCfg.threads) return;

            const logCh = await thread.guild.channels.fetch(logCfg.threads).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('🧵 Thread Deleted')
                .addFields(
                    { name: 'Name', value: thread.name, inline: true },
                    { name: 'Parent', value: thread.parent?.name || 'Unknown', inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    }
];
