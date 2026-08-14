const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View user statistics')
    .addUserOption(opt => opt.setName('user').setDescription('User')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user') || interaction.user;
    const raw = await db.get(`stats_${interaction.guild.id}_${user.id}`) || {};
    const stats = {
        messages: Number(raw.messages) || 0,
        voiceTime: Number(raw.voiceTime) || 0,
        reactions: Number(raw.reactions) || 0
    };
    const voiceHours = (stats.voiceTime / (1000 * 60 * 60)).toFixed(2);
    const total = stats.messages + Math.floor(stats.voiceTime / 60000) + stats.reactions;

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`📈 Statistics for ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: '📝 Messages', value: `${stats.messages.toLocaleString()}`, inline: true },
        { name: '🎤 Voice Time', value: `${voiceHours}h`, inline: true },
        { name: '❤️ Reactions', value: `${stats.reactions.toLocaleString()}`, inline: true },
        { name: '🏆 Total Points', value: `${total.toLocaleString()}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
