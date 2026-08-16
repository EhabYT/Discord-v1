const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot and API latency'),

  async execute(interaction, client, db) {
    const sentAt = Date.now();
    await interaction.reply({ content: '📡 Pinging...' });
    const reply = await interaction.fetchReply().catch(() => null);
    const latency = (reply?.createdTimestamp || Date.now()) - (interaction.createdTimestamp || sentAt);

    const embed = new EmbedBuilder()
      .setColor('#00fbff')
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '🤖 Bot Latency', value: `\`${latency}ms\``, inline: true },
        { name: '📡 API Latency', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  }
};
