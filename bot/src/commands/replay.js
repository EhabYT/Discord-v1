const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('replay')
        .setDescription('Restart the current track'),

    async execute(interaction, client, db) {
        const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
            return safeReply(interaction, { content: '❌ No music playing.', flags: [MessageFlags.Ephemeral] });
        }
        if (!(await checkDJPerms(interaction, db))) {
            return safeReply(interaction, { content: '❌ DJ role required.', flags: [MessageFlags.Ephemeral] });
        }
        await queue.node.seek(0);
        await safeReply(interaction, { content: `🔁 Replaying **${queue.currentTrack.title}**.` });
    }
};
