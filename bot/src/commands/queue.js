const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current music queue'),

    async execute(interaction, client, db) {
        const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
        if (!queue || (!queue.isPlaying() && !queue.tracks.size)) {
            return safeReply(interaction, {
                content: '❌ Queue is empty or no music playing.', flags: [MessageFlags.Ephemeral]
            });
        }

        const tracks = queue.tracks.toArray().slice(0, 10);
        const desc = tracks.map((t, i) => `**${i + 1}.** [${t.title}](${t.url}) — ${t.duration}`).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#00fbff') // Neon Blue
            .setTitle('🎶 Current Queue')
            .setDescription(`**Now Playing:** [${queue.currentTrack.title}](${queue.currentTrack.url})\n\n**Next Up:**\n${desc || '_No more songs in queue_'}`)
            .setFooter({
                text: `${queue.tracks.size} songs in queue`
            })
            .setTimestamp();

        await safeReply(interaction, { embeds: [embed] });
    }
};
