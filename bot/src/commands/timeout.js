const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Duration (1m, 1h, 1d, 1w)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const timeStr = interaction.options.getString('time');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = client.helpers.parseTimeString(timeStr);

    if (!duration) {
      return safeReply(interaction, { content: '❌ Invalid duration. Use 1m, 1h, 1d, etc.', flags: [MessageFlags.Ephemeral] });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return safeReply(interaction, { content: '❌ User not found.', flags: [MessageFlags.Ephemeral] });
    }

    try {
      await member.timeout(duration, `${reason} | By: ${interaction.user.tag}`);
      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('⏳ User Timed Out')
        .addFields(
          { name: 'User', value: `${user.tag}`, inline: true },
          { name: 'Duration', value: client.helpers.formatDuration(duration), inline: true },
          { name: 'Reason', value: reason }
        ).setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
