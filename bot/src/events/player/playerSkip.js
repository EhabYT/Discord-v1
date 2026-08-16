const { EmbedBuilder } = require('discord.js');
const config = require('../../../../config/bot.json');

module.exports = {
    name: 'playerSkip',
    async execute(queue, track) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setDescription(` Skipped: **${track.title}** (not playable)`)
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
