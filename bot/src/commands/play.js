const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { QueryType } = require('discord-player');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or playlist')
    .addStringOption(opt => opt.setName('query').setDescription('Song name or URL').setRequired(true)),
  defer: true,

  async execute(interaction, client, db) {
    const logger = require('../../../shared/lib/logger');
    const player = client.player;
    const query = interaction.options.getString('query');

    if (!interaction.member.voice.channel) {
      return safeReply(interaction, { content: '❌ You must be in a voice channel.', flags: [MessageFlags.Ephemeral] });
    }

    // DJ Check
    const isDJ = await checkDJPerms(interaction, db);
    if (!isDJ) {
      return safeReply(interaction, { content: '❌ You need the DJ role to use this command when others are in the channel.', flags: [MessageFlags.Ephemeral] });
    }

    try {
      const searchResult = await player.search(query, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO
      });

      if (!searchResult || !searchResult.tracks.length) {
        return safeReply(interaction, { content: '❌ No results found.' });
      }

      const { track } = await player.play(interaction.member.voice.channel, searchResult, {
        nodeOptions: {
          metadata: { channel: interaction.channel },
          selfDeaf: true,
          volume: 50,
          leaveOnEmpty: true,
          leaveOnEnd: false
        }
      });

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('🎶 Added to Queue')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .addFields(
          { name: 'Duration', value: track.duration, inline: true },
          { name: 'Requested by', value: interaction.user.toString(), inline: true }
        )
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      logger.error('Play command failed', { error: err.message, query });
      await safeReply(interaction, { content: `❌ Error: ${err.message}` });
    }
  }
};
