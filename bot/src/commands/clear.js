const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages').setRequired(true).setMinValue(1).setMaxValue(100))
    .addStringOption(opt => opt.setName('target').setDescription('Filter: "bots" or @user')),

  async execute(interaction, client, db) {
    const amount = interaction.options.getInteger('amount');
    const target = interaction.options.getString('target');

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      let messages = await interaction.channel.messages.fetch({ limit: amount });
      if (target) {
        if (target.toLowerCase() === 'bots') {
          messages = messages.filter(m => m.author.bot);
        } else {
          const userMatch = target.match(/(\d{17,20})/);
          if (userMatch) messages = messages.filter(m => m.author.id === userMatch[1]);
        }
      }

      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      messages = messages.filter(m => m.createdTimestamp > twoWeeksAgo);

      if (messages.size === 0) {
        return safeReply(interaction, { content: '❌ No messages found (older than 14 days cannot be bulk deleted).' });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);

      const embed = new EmbedBuilder()
        .setColor('#00fbff') // Neon Blue
        .setTitle('🗑️ Messages Deleted')
        .setDescription(`Successfully deleted **${deleted.size}** messages.`)
        .setTimestamp();

      await safeReply(interaction, { embeds: [embed] });
    } catch (err) {
      await safeReply(interaction, { content: `❌ Failed: ${err.message}` });
    }
  }
};
