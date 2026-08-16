const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption(opt => opt.setName('time').setDescription('Time (1h, 1d, etc.)').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('What to remind you about').setRequired(true)),

  async execute(interaction, client, db) {
    const timeStr = interaction.options.getString('time');
    const reason = interaction.options.getString('reason');
    const duration = client.helpers.parseTimeString(timeStr);
    if (!duration) return interaction.reply({ content: '❌ Invalid time format.', flags: [MessageFlags.Ephemeral] });
    const expiresAt = Date.now() + duration;
    const reminders = await db.get(`reminders_${interaction.user.id}`) || [];
    reminders.push({ channelId: interaction.channel.id, reason, expiresAt });
    await db.set(`reminders_${interaction.user.id}`, reminders);
    const embed = new EmbedBuilder().setColor('#00FF00').setTitle('⏰ Reminder Set')
      .setDescription(`I will remind you about: **${reason}**\n\n⏰ When: <t:${Math.floor(expiresAt / 1000)}:R>`).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
};
