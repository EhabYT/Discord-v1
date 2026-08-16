const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getEdit } = require('../../../shared/services/snipe');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editsnipe')
        .setDescription('Show the last edited message in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, client) {
        const entry = getEdit(interaction.channel.id);
        if (!entry) {
            return client.helpers.safeReply(interaction, { content: '❌ Nothing to snipe here.', flags: [MessageFlags.Ephemeral] });
        }
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setAuthor({ name: entry.tag || 'Unknown', iconURL: entry.avatar || undefined })
            .addFields(
                { name: 'Before', value: (entry.before || '*empty*').slice(0, 1024) },
                { name: 'After', value: (entry.after || '*empty*').slice(0, 1024) }
            )
            .setFooter({ text: 'Edited message' })
            .setTimestamp(entry.ts);
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
