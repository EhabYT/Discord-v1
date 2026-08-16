const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),

  async execute(interaction, client, db) {
    const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
    if (!queue || queue.tracks.size < 2) {
      return safeReply(interaction, { content: '❌ Not enough songs to shuffle.', flags: [MessageFlags.Ephemeral] });
    }

    // DJ Check
    const isDJ = await checkDJPerms(interaction, db);
    if (!isDJ) {
      return safeReply(interaction, { content: '❌ You need the DJ role to use this command when others are in the channel.', flags: [MessageFlags.Ephemeral] });
    }

    queue.tracks.shuffle();
    await safeReply(interaction, { content: '🔀 Queue shuffled!' });
  }
};
