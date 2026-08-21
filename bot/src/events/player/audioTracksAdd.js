const { EmbedBuilder } = require('discord.js');
const config = require('../../../../shared/config/bot-config').config;

module.exports = {
    name: 'audioTracksAdd',
    async execute(queue, tracks) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setDescription(` **${tracks.length}** tracks added to queue`)
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
