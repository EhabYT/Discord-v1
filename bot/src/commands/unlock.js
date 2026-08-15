const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, client, db) {
        const { safeReply } = client.helpers;

        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF88')
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`This channel has been unlocked by ${interaction.user}.`)
                .setTimestamp();

            await safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            const { MessageFlags } = require('discord.js');
            await safeReply(interaction, { content: `❌ Failed to unlock channel: ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
