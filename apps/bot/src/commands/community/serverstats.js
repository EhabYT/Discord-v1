const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('View server-wide statistics'),

  async execute(interaction, _client, db) {
    await interaction.deferReply();
    const totals = await db.aggregateStatsPrefix(`stats_${interaction.guild.id}_`);
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`📊 ${interaction.guild.name} Statistics`)
      .setThumbnail(interaction.guild.iconURL({ size: 128 }))
      .addFields(
        { name: '👥 Members', value: `${interaction.guild.memberCount}`, inline: true },
        { name: '📊 Active', value: `${totals.activeUsers}`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '📝 Messages', value: totals.totalMessages.toLocaleString(), inline: true },
        { name: '🎤 Voice', value: `${(totals.totalVoice / 3_600_000).toFixed(1)}h`, inline: true },
        { name: '❤️ Reactions', value: totals.totalReactions.toLocaleString(), inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
