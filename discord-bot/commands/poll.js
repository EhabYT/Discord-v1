const { SlashCommandBuilder, EmbedBuilder, MessageFlags
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption(opt => opt.setName('question').setDescription('Question').setRequired(true))
    .addStringOption(opt => opt.setName('options').setDescription('Options (separated by |)')),

  async execute(interaction, client, db) {
    const question = interaction.options.getString('question');
    const optionsStr = interaction.options.getString('options');
    const embed = new EmbedBuilder().setColor('#0099FF').setTitle('🗳️ Poll').setDescription(`**${question
      }**`).setAuthor({
        name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL()
      }).setTimestamp();
    if (optionsStr) {
      const options = optionsStr.split('|').map(o => o.trim()).filter(o => o.length > 0);
      if (options.length > 10) return interaction.reply({
        content: '❌ Maximum 10 options.', flags: [MessageFlags.Ephemeral]
      });
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'
      ];
      embed.addFields({
        name: 'Options', value: options.map((o, i) => `${emojis[i
        ]
          } ${o
          }`).join('\n')
      });
      const message = await interaction.reply({
        embeds: [embed
        ], fetchReply: true
      });
      for (let i = 0; i < options.length; i++) await message.react(emojis[i
      ]);
    } else {
      const message = await interaction.reply({
        embeds: [embed
        ], fetchReply: true
      });
      await message.react('✅'); await message.react('❌');
    }
  }
};
