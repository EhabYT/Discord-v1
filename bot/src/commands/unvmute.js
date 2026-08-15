const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unvmute')
    .setDescription('Unmute a voice muted member!')
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true)),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ content: '❌ User not found.', flags: [MessageFlags.Ephemeral] });
    if (!member.voice.channel) return interaction.reply({ content: '❌ User is not in a voice channel.', flags: [MessageFlags.Ephemeral] });

    try {
      await member.voice.setMute(false, `Unmuted by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🔊 Voice Unmuted')
        .setDescription(`${user} has been unmuted in voice.`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await interaction.reply({ content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
