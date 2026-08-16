const { EmbedBuilder } = require('discord.js');
const config = require('../../../../config/bot.json');

module.exports = {
    name: 'emptyQueue',
    async execute(queue) {
        const db = queue.player.client.db;
        const autoplay = await db.get(`autoplay_${queue.guild.id}`);
        if (autoplay) return;

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setDescription(`🎵 **Queue finished!** Add more songs or use \`/autoplay\` for suggestions.`)
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
