const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnect the bot from the voice channel'),

    async execute(interaction, client, db) {
        const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
        if (!queue) {
            return safeReply(interaction, { content: '❌ I am not in a voice channel.', flags: [MessageFlags.Ephemeral] });
        }
        if (!(await checkDJPerms(interaction, db))) {
            return safeReply(interaction, { content: '❌ DJ role required.', flags: [MessageFlags.Ephemeral] });
        }
        queue.delete();
        await safeReply(interaction, { content: '👋 Left the voice channel.' });
    }
};
