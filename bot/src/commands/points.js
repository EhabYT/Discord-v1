const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('points')
    .setDescription('View or manage points')
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption(opt => opt.setName('value').setDescription('+10, -5, or reset (mod only)')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const value = interaction.options.getString('value');
    const key = `points_${interaction.guild.id}_${user.id}`;
    if (value) {
      if (!client.helpers.hasModPerms(interaction.member)) return interaction.reply({ content: '❌ Mods only.', flags: [MessageFlags.Ephemeral] });
      if (value.toLowerCase() === 'reset') { await db.set(key, 0); return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setDescription(`🔄 ${user}'s points reset to 0.`).setTimestamp()] }); }
      const change = parseInt(value);
      if (isNaN(change)) return interaction.reply({ content: '❌ Invalid value.', flags: [MessageFlags.Ephemeral] });
      const current = (await db.get(key)) || 0;
      await db.set(key, current + change);
      const embed = new EmbedBuilder().setColor('#0099FF').setTitle('📊 Points Updated')
        .addFields({ name: 'User', value: `${user}`, inline: true }, { name: 'Change', value: `${change > 0 ? '+' : ''}${change}`, inline: true }, { name: 'Total', value: `${current + change}`, inline: true }).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    const points = (await db.get(key)) || 0;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle(`📊 ${user.tag}`).setDescription(`**${points}** points`).setTimestamp()] });
  }
};
