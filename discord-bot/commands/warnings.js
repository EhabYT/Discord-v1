const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(opt => opt.setName('user').setDescription('User')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user') || interaction.user;
    const key = `warnings_${interaction.guild.id}_${user.id}`;
    const warnings = await db.get(key) || [];

    if (warnings.length === 0) {
      return safeReply(interaction, { content: `✅ ${user.tag} has no warnings.`, flags: [MessageFlags.Ephemeral] });
    }

    const embed = new EmbedBuilder()
      .setColor('#00fbff') // Neon Blue
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setDescription(`Total: ${warnings.length} warning(s)`)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    for (const warn of warnings.slice(-10)) {
      embed.addFields({
        name: `ID: ${warn.id}`,
        value: `**Reason:** ${warn.reason}\n**Moderator:** <@${warn.moderator}>\n**Date:** <t:${Math.floor(warn.timestamp / 1000)}:R>`
      });
    }

    if (warnings.length > 10) {
      embed.setFooter({ text: `Showing latest 10 of ${warnings.length}` });
    }

    await safeReply(interaction, { embeds: [embed] });
  }
};
