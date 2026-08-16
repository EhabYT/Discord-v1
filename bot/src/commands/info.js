const { SlashCommandBuilder, EmbedBuilder, version } = require('discord.js');
const os = require('os');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Display bot information'),

  async execute(interaction, client, db) {
    const uptime = client.helpers.formatDuration(client.uptime);
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🤖 Bot Information')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: 'Tag', value: client.user.tag, inline: true },
        { name: 'ID', value: client.user.id, inline: true },
        { name: 'Version', value: require('../../../package.json').version, inline: true },
        { name: 'Discord.js', value: `v${version}`, inline: true },
        { name: 'Node.js', value: process.version, inline: true },
        { name: 'OS', value: `${os.type()} ${os.release()}`, inline: true },
        { name: 'Guilds', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Users', value: `${client.users.cache.size}`, inline: true },
        { name: 'Uptime', value: uptime, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
