const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Display user avatar')
    .addUserOption(opt => opt.setName('user').setDescription('User')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const url = user.displayAvatarURL({ size: 1024, extension: 'png'
        });
    const embed = new EmbedBuilder().setColor('#0099FF').setTitle(`${user.tag
        }'s Avatar`).setImage(url).setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Download').setStyle(ButtonStyle.Link).setURL(url));
    await interaction.reply({ embeds: [embed
            ], components: [row
            ]
        });
    }
};
