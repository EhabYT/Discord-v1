const { EmbedBuilder } = require('discord.js');
const logger = require('../../../../shared/lib/logger');

module.exports = {
    name: 'playerError',
    async execute(queue, error) {
        logger.error('Player track error', {
            error: error.message,
            guild: queue && queue.guild ? queue.guild.name : undefined
        });

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription(`❌ Error playing track: ${error.message}`)
            .setTimestamp();

        if (queue.metadata && queue.metadata.channel) {
            await queue.metadata.channel.send({ embeds: [embed] }).catch(() => { });
        }
    }
};
