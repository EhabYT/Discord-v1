const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

function warnId(warn, i = 0) {
  return warn.id || String(warn.timestamp || i);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View or delete warnings')
    .addSubcommand(sub => sub.setName('list').setDescription('View warnings for a user')
      .addUserOption(opt => opt.setName('user').setDescription('User')))
    .addSubcommand(sub => sub.setName('remove').setDescription('Delete one warning')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
      .addStringOption(opt => opt.setName('id').setDescription('Warning ID or number from /warnings list').setRequired(true)))
    .addSubcommand(sub => sub.setName('clear').setDescription('Delete all warnings for a user')
      .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))),

  async execute(interaction, client, db) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user') || interaction.user;
    const key = `warnings_${interaction.guild.id}_${user.id}`;
    const warnings = await db.get(key) || [];

    if (sub === 'remove' || sub === 'clear') {
      const canMod = interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers);
      if (!canMod) {
        return safeReply(interaction, { content: '❌ You need Moderate Members to delete warnings.', flags: [MessageFlags.Ephemeral] });
      }
    }

    if (sub === 'clear') {
      if (warnings.length === 0) {
        return safeReply(interaction, { content: `✅ ${user.tag} has no warnings.`, flags: [MessageFlags.Ephemeral] });
      }
      await db.set(key, []);
      const embed = new EmbedBuilder()
        .setColor('#00fbff')
        .setTitle('✅ Warnings deleted')
        .setDescription(`Removed **${warnings.length}** warning(s) from ${user}.`)
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
    }

    if (sub === 'remove') {
      const input = (interaction.options.getString('id') || '').trim();
      if (warnings.length === 0) {
        return safeReply(interaction, { content: `❌ ${user.tag} has no warnings.`, flags: [MessageFlags.Ephemeral] });
      }
      let index = warnings.findIndex((w, i) => warnId(w, i) === input);
      if (index === -1 && /^\d+$/.test(input)) {
        const n = Number(input) - 1;
        if (n >= 0 && n < warnings.length) index = n;
      }
      if (index === -1) {
        return safeReply(interaction, { content: '❌ Warning ID or number not found. Use `/warnings list` first.', flags: [MessageFlags.Ephemeral] });
      }
      const removed = warnings.splice(index, 1)[0];
      await db.set(key, warnings);
      const embed = new EmbedBuilder()
        .setColor('#00fbff')
        .setTitle('✅ Warning deleted')
        .addFields(
          { name: 'User', value: `${user}`, inline: true },
          { name: 'Warning ID', value: `\`${warnId(removed, index)}\``, inline: true },
          { name: 'Reason', value: removed.reason || '—' },
          { name: 'Remaining', value: `${warnings.length}`, inline: true }
        )
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
    }

    if (warnings.length === 0) {
      return safeReply(interaction, { content: `✅ ${user.tag} has no warnings.`, flags: [MessageFlags.Ephemeral] });
    }

    const embed = new EmbedBuilder()
      .setColor('#00fbff')
      .setTitle(`⚠️ Warnings for ${user.tag}`)
      .setDescription(`Total: ${warnings.length} warning(s)\nDelete one with \`/warnings remove\` · clear all with \`/warnings clear\``)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    warnings.slice(-10).forEach((warn, i) => {
      const abs = warnings.length > 10 ? warnings.length - 10 + i : i;
      embed.addFields({
        name: `#${abs + 1} · ID: ${warnId(warn, abs)}`,
        value: `**Reason:** ${warn.reason || '—'}\n**Moderator:** <@${warn.moderator}>\n**Date:** <t:${Math.floor((warn.timestamp || 0) / 1000)}:R>`
      });
    });

    if (warnings.length > 10) {
      embed.setFooter({ text: `Showing latest 10 of ${warnings.length}` });
    }

    await safeReply(interaction, { embeds: [embed] });
  }
};
