const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { QueueRepeatMode } = require('discord-player');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addIntegerOption(opt => opt.setName('mode').setDescription('Loop mode').setRequired(true)
      .addChoices(
        { name: 'Off', value: QueueRepeatMode.OFF },
        { name: 'Track', value: QueueRepeatMode.TRACK },
        { name: 'Queue', value: QueueRepeatMode.QUEUE },
        { name: 'Autoplay', value: QueueRepeatMode.AUTOPLAY }
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

    const mode = interaction.options.getInteger('mode');
    queue.setRepeatMode(mode);

    const modeNames = ['Off', 'Track', 'Queue', 'Autoplay'];
    await safeReply(interaction, { content: `🔁 Loop mode set to **${modeNames[mode]}**` });
  }
};
