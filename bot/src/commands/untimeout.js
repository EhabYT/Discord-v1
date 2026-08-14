const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return safeReply(interaction, { content: '❌ User not found.', flags: [MessageFlags.Ephemeral] });
    }
    if (typeof member.isCommunicationDisabled === 'function' ? !member.isCommunicationDisabled() : !member.communicationDisabledUntil) {
      return safeReply(interaction, { content: '❌ User is not timed out.', flags: [MessageFlags.Ephemeral] });
    }

    try {
      await member.timeout(null, `Timeout removed by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('🔊 Timeout Removed')
        .addFields(
          { name: 'User', value: `${user.tag}`, inline: true },
          { name: 'Moderator', value: `${interaction.user}`, inline: true }
        )
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
