const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set the slowmode for the current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addIntegerOption(opt => opt.setName('seconds').setDescription('Slowmode duration in seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)),

    async execute(interaction, client, db) {
        const seconds = interaction.options.getInteger('seconds');
        const { safeReply } = client.helpers;

        try {
            await interaction.channel.setRateLimitPerUser(seconds);

            const embed = new EmbedBuilder()
                .setColor(seconds > 0 ? '#FFA500' : '#00FF88')
                .setTitle('⏱️ Slowmode Updated')
                .setDescription(`Slowmode for ${interaction.channel} has been set to **${seconds}s**.`)
                .setFooter({ text: `Action by ${interaction.user.tag}` })
                .setTimestamp();

            await safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            const { MessageFlags } = require('discord.js');
            await safeReply(interaction, { content: `❌ Failed to update slowmode: ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
