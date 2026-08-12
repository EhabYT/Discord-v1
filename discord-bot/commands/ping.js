const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { safeReply } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot and API latency'),

  async execute(interaction, client, db) {
    const response = await interaction.reply({ content: '📡 Pinging...', withResponse: true });
    const latency = response.resource.message.createdTimestamp - interaction.createdTimestamp;

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
