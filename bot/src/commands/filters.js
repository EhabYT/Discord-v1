const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filters')
    .setDescription('Apply audio filters')
    .addStringOption(opt => opt.setName('filter').setDescription('Filter to toggle').setRequired(true)
      .addChoices(
        { name: 'Bassboost', value: 'bassboost' },
        { name: 'Nightcore', value: 'nightcore' },
        { name: 'Vaporwave', value: 'vaporwave' },
        { name: 'Lofi', value: 'lofi' },
        { name: 'Surround', value: 'surround' },
        { name: '8D', value: '8D' },
        { name: 'Clear All', value: 'clear' }
      )),

  async execute(interaction, client, db) {
    const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
    if (!queue || !queue.isPlaying()) {
      return safeReply(interaction, { content: '❌ No music playing.', flags: [MessageFlags.Ephemeral] });
    }

    // DJ Check
    const isDJ = await checkDJPerms(interaction, db);
    if (!isDJ) {
      return safeReply(interaction, { content: '❌ You need the DJ role to use this command when others are in the channel.', flags: [MessageFlags.Ephemeral] });
    }

    const filter = interaction.options.getString('filter');
    if (filter === 'clear') {
      queue.filters.ffmpeg.setFilters(false);
      return safeReply(interaction, { content: '✨ All filters cleared.' });
    }

    await queue.filters.ffmpeg.toggle(filter);
    const enabled = queue.filters.ffmpeg.getFiltersEnabled();
    const isNowActive = enabled.includes(filter);
    await safeReply(interaction, { content: `🎧 Filter **${filter}** ${isNowActive ? 'enabled' : 'disabled'}.` });
  }
};
