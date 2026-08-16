const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user temporarily or permanently')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Duration (1m, 1h, 1d, 1w, 1mo)'))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const timeStr = interaction.options.getString('time');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const { parseTimeString, formatDuration } = client.helpers;

    if (user.id === interaction.user.id) {
      return safeReply(interaction, { content: '❌ You cannot ban yourself.', flags: [MessageFlags.Ephemeral] });
    }
    if (user.id === client.user.id) {
      return safeReply(interaction, { content: '❌ I cannot ban myself.', flags: [MessageFlags.Ephemeral] });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return safeReply(interaction, { content: '❌ You cannot ban someone with a higher or equal role.', flags: [MessageFlags.Ephemeral] });
      }
      if (!member.bannable) {
        return safeReply(interaction, { content: '❌ I cannot ban this user.', flags: [MessageFlags.Ephemeral] });
      }
    }

    let duration = null;
    if (timeStr) {
      duration = parseTimeString(timeStr);
      if (!duration) {
        return safeReply(interaction, { content: '❌ Invalid time format. Use: 1m, 1h, 1d, 1w, 1mo', flags: [MessageFlags.Ephemeral] });
      }
    }

    try {
      await interaction.guild.members.ban(user, { reason: `${reason} | By: ${interaction.user.tag}`, deleteMessageSeconds: 604800 });

      if (duration) {
        const bans = await db.get(`tempbans_${interaction.guild.id}`) || [];
        bans.push({ userId: user.id, moderator: interaction.user.id, reason, expiresAt: Date.now() + duration, bannedAt: Date.now() });
        await db.set(`tempbans_${interaction.guild.id}`, bans);
      }

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue (Phase 14 Standard)
        .setTitle('🔨 User Banned')
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Moderator', value: `${interaction.user}`, inline: true },
          { name: 'Reason', value: reason },
          { name: 'Duration', value: duration ? formatDuration(duration) : 'Permanent', inline: true }
        )
        .setTimestamp();

      if (duration) {
        embed.addFields({ name: 'Expires', value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true });
      }

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: `❌ Failed to ban: ${err.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
