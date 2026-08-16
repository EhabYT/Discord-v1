const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('View details of the current song'),

  async execute(interaction, client, db) {
    const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return safeReply(interaction, {
        content: '❌ No music playing.', flags: [MessageFlags.Ephemeral]
      });
    }

    const track = queue.currentTrack;
    const progress = queue.node.createProgressBar();

    const embed = new EmbedBuilder()
      .setColor('#00fbff') // Neon Blue
      .setTitle('🎶 Now Playing')
      .setDescription(`**[${track.title}](${track.url})**\nby ${track.author}`)
      .setThumbnail(track.thumbnail)
      .addFields({ name: 'Progress', value: progress || '_Not available_' })
      .setTimestamp();

    await safeReply(interaction, { embeds: [embed] });
  }
};
