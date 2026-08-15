const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setnick')
    .setDescription('Change a user\'s nickname')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
    .addStringOption(opt => opt.setName('nick').setDescription('New nickname (empty to reset)')),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    const nick = interaction.options.getString('nick') || null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) return interaction.reply({ content: '❌ User not found.', flags: [MessageFlags.Ephemeral] });
    if (!member.manageable) return interaction.reply({ content: '❌ Cannot change nickname.', flags: [MessageFlags.Ephemeral] });

    try {
      const oldNick = member.nickname || member.user.username;
      await member.setNickname(nick, `Changed by ${interaction.user.tag}`);

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('✏️ Nickname Changed')
        .addFields(
          { name: 'User', value: `${user.tag}`, inline: true },
          { name: 'Before', value: oldNick, inline: true },
          { name: 'After', value: nick || user.username, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      await interaction.reply({ content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
    }
  }
};
