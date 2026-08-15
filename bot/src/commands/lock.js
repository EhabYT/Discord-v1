const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, client, db) {
        const { safeReply } = client.helpers;

        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF4444')
                .setTitle('🔒 Channel Locked')
                .setDescription(`This channel has been locked by ${interaction.user}.`)
                .setTimestamp();

            await safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            const { MessageFlags } = require('discord.js');
            await safeReply(interaction, { content: `❌ Failed to lock channel: ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
