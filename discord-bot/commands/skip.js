const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useQueue } = require('discord-player');
const { safeReply, checkDJPerms } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song'),

  async execute(interaction, client, db) {
    const queue = useQueue(interaction.guild.id);
    if (!queue || !queue.isPlaying()) {
      return safeReply(interaction, { content: '❌ No music playing.', flags: [MessageFlags.Ephemeral] });
    }

    // DJ Check
    const isDJ = await checkDJPerms(interaction, db);
    if (!isDJ) {
      return safeReply(interaction, { content: '❌ You need the DJ role to use this command when others are in the channel.', flags: [MessageFlags.Ephemeral] });
    }

    const currentTrack = queue.currentTrack;
    queue.node.skip();
    await safeReply(interaction, { content: `⏭️ Skipped: **${currentTrack.title}**` });
  }
};
