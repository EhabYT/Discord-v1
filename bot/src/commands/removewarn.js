const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

function warnId(warn, i = 0) {
  return warn.id || String(warn.timestamp || i);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Delete one warning or all warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User whose warnings to delete').setRequired(true))
    .addStringOption(opt => opt.setName('id').setDescription('Warning ID or number (omit to delete all)')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const input = (interaction.options.getString('id') || '').trim();
    const key = `warnings_${interaction.guild.id}_${user.id}`;
    const warnings = await db.get(key) || [];

    if (warnings.length === 0) {
      return safeReply(interaction, { content: `❌ ${user.tag} has no warnings.`, flags: [MessageFlags.Ephemeral] });
    }

    if (!input) {
      await db.set(key, []);
      const embed = new EmbedBuilder()
        .setColor('#00fbff')
        .setTitle('✅ Warnings deleted')
        .setDescription(`Removed **${warnings.length}** warning(s) from ${user}.`)
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
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
};
