const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remove a warning by ID or all warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(opt => opt.setName('id_or_user').setDescription('Warning ID or @user').setRequired(true)),

  async execute(interaction, client, db) {
    const input = interaction.options.getString('id_or_user');
    const userMatch = input.match(/(\d{17,20})/);

    if (userMatch && input.includes('<@')) {
      const userId = userMatch[1];
      const key = `warnings_${interaction.guild.id}_${userId}`;
      const warnings = await db.get(key) || [];
      if (warnings.length === 0) {
        return safeReply(interaction, { content: '❌ No warnings found for this user.', flags: [MessageFlags.Ephemeral] });
      }

      await db.set(key, []);
      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('✅ Warnings Cleared')
        .setDescription(`Successfully removed ${warnings.length} warning(s) from <@${userId}>`)
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
    }

    const guildId = interaction.guild.id;
    const members = await interaction.guild.members.fetch();
    let found = false;

    for (const [memberId] of members) {
      const key = `warnings_${guildId}_${memberId}`;
      const warnings = await db.get(key) || [];
      const index = warnings.findIndex(w => w.id === input);
      if (index !== -1) {
        const removed = warnings.splice(index, 1)[0];
        await db.set(key, warnings);
        const embed = new EmbedBuilder()
          .setColor('#00fbff') // Neon Blue
          .setTitle('✅ Warning Removed')
          .addFields(
            { name: 'Warning ID', value: `\`${input}\``, inline: true },
            { name: 'User', value: `<@${memberId}>`, inline: true },
            { name: 'Original Reason', value: removed.reason }
          )
          .setTimestamp();
        await safeReply(interaction, { embeds: [embed] });
        found = true;
        break;
      }
    }

    if (!found) {
      await safeReply(interaction, { content: '❌ Warning ID not found.', flags: [MessageFlags.Ephemeral] });
    }
  }
};
