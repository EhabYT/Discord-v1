const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Get lyrics for a song')
    .addStringOption(opt => opt.setName('query').setDescription('Song name')),
  defer: true,

  async execute(interaction, client, db) {
    const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
    const query = interaction.options.getString('query') || queue?.currentTrack?.title;

    if (!query) {
      return safeReply(interaction, {
        content: '❌ Please provide a song name or play something first.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const player = client.player;
    try {
      const results = await player.lyrics.search({ q: query });
      const lyrics = results?.[0];

      if (!lyrics) {
        return safeReply(interaction, {
          content: '❌ No lyrics found for this song.'
        });
      }

      const text = lyrics.plainLyrics || lyrics.lyrics || lyrics.text || '';
      const artistName = lyrics.artist?.name || lyrics.artist || 'Unknown';
      if (!text) {
        return safeReply(interaction, { content: '❌ Lyrics were empty for this song.' });
      }

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle(`🎵 Lyrics: ${lyrics.title || query}`)
        .setAuthor({ name: String(artistName) })
        .setDescription(String(text).slice(0, 4000))
        .setFooter({ text: 'Powered by Genius' })
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: '❌ Error fetching lyrics.' });
    }
  }
};
