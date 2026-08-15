const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return safeReply(interaction, {
        content: '❌ User not found.', flags: [MessageFlags.Ephemeral]
      });
    }

    if (user.id === interaction.user.id) {
      return safeReply(interaction, {
        content: '❌ You cannot kick yourself.', flags: [MessageFlags.Ephemeral]
      });
    }

    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
      return safeReply(interaction, {
        content: '❌ You cannot kick someone with a higher or equal role.', flags: [MessageFlags.Ephemeral]
      });
    }

    if (!member.kickable) {
      return safeReply(interaction, {
        content: '❌ I cannot kick this user.', flags: [MessageFlags.Ephemeral]
      });
    }

    try {
      await member.kick(`${reason} | By: ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('👢 User Kicked')
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderator', value: `${interaction.user}`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, {
        content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral]
      });
    }
  }
};
