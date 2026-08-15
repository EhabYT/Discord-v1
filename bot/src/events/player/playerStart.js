const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'playerStart',
    async execute(queue, track) {
        const sourceIcon = track.url?.includes('spotify') ? '🟢' : '🔴';
        const sourceName = track.url?.includes('spotify') ? 'Spotify' : 'YouTube';

        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('🎶 Now Playing')
            .setDescription(`[${track.title}](${track.url})`)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: '⏱️ Duration', value: track.duration, inline: true },
                { name: '🎤 Artist', value: track.author || 'Unknown', inline: true },
                { name: '📨 Requested by', value: String(track.requestedBy), inline: true },
                { name: '📡 Source', value: `${sourceIcon} ${sourceName}`, inline: true }
            )
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
