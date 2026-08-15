const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getDelete } = require('../../../shared/services/snipe');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('snipe')
        .setDescription('Show the last deleted message in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, client) {
        const entry = getDelete(interaction.channel.id);
        if (!entry) {
            return client.helpers.safeReply(interaction, { content: '❌ Nothing to snipe here.', flags: [MessageFlags.Ephemeral] });
        }
        const embed = new EmbedBuilder()
            .setColor('#FF4D4D')
            .setAuthor({ name: entry.tag || 'Unknown', iconURL: entry.avatar || undefined })
            .setDescription(entry.content || '*No text*')
            .setFooter({ text: 'Deleted message' })
            .setTimestamp(entry.ts);
        if (entry.image) embed.setImage(entry.image);
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
