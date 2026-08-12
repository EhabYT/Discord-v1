const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { useQueue, useMainPlayer } = require('discord-player');
const { safeReply } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Get lyrics for a song')
    .addStringOption(opt => opt.setName('query').setDescription('Song name')),
  defer: true,

  async execute(interaction, client, db) {
    const queue = useQueue(interaction.guild.id);
    const query = interaction.options.getString('query') || queue?.currentTrack?.title;

    if (!query) {
      return safeReply(interaction, {
        content: '❌ Please provide a song name or play something first.',
        flags: [MessageFlags.Ephemeral]
      });
    }

    const player = useMainPlayer();
    try {
      const results = await player.lyrics.search({ q: query });
      const lyrics = results?.[0];

      if (!lyrics) {
        return safeReply(interaction, {
          content: '❌ No lyrics found for this song.'
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle(`🎵 Lyrics: ${lyrics.title}`)
        .setAuthor({ name: lyrics.artist.name })
        .setDescription(lyrics.plainLyrics.slice(0, 4000))
        .setFooter({ text: 'Powered by Genius' })
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: '❌ Error fetching lyrics.' });
    }
  }
};
