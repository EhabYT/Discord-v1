const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Adjust the volume')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Volume (0-100)').setRequired(true).setMinValue(0).setMaxValue(100)),

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

    const vol = interaction.options.getInteger('amount');
    queue.node.setVolume(vol);
    await safeReply(interaction, { content: `🔊 Volume set to **${vol}%**` });
  }
};
