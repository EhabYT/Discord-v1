const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a track from the queue')
        .addIntegerOption(opt => opt.setName('position').setDescription('Queue position (1 = next song)').setRequired(true).setMinValue(1)),

    async execute(interaction, client, db) {
        const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
            return safeReply(interaction, { content: '❌ No music playing.', flags: [MessageFlags.Ephemeral] });
        }
        if (!(await checkDJPerms(interaction, db))) {
            return safeReply(interaction, { content: '❌ DJ role required.', flags: [MessageFlags.Ephemeral] });
        }
        const pos = interaction.options.getInteger('position');
        const tracks = queue.tracks.toArray();
        const track = tracks[pos - 1];
        if (!track) {
            return safeReply(interaction, { content: `❌ No track at position ${pos}.`, flags: [MessageFlags.Ephemeral] });
        }
        if (typeof queue.removeTrack === 'function') queue.removeTrack(track);
        else if (queue.node?.remove) queue.node.remove(track);
        else queue.tracks.removeOne(t => t.id === track.id);
        await safeReply(interaction, { content: `🗑️ Removed **${track.title}**.` });
    }
};
