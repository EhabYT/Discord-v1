const { EmbedBuilder } = require('discord.js');
const config = require('../../../../config/bot.json');

module.exports = {
    name: 'disconnect',
    async execute(queue) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setDescription('👋 **Disconnected from voice channel.** The queue has been cleared.')
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
