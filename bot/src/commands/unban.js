const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(opt => opt.setName('id').setDescription('User ID').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason')),

  async execute(interaction, client, db) {
    const userId = interaction.options.getString('id');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      await interaction.guild.members.unban(userId, `${reason} | By: ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('🔓 User Unbanned')
        .setDescription(`Successfully unbanned user ID: \`${userId}\``)
        .addFields({ name: 'Reason', value: reason })
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
