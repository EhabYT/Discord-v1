const { EmbedBuilder } = require('discord.js');
const config = require('../../../../config/bot.json');

module.exports = {
    name: 'audioTrackAdd',
    async execute(queue, track) {
        if (!queue.isPlaying()) return;

        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setDescription(` **[${track.title}](${track.url})** added to queue (Position: ${queue.tracks.size})`)
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
