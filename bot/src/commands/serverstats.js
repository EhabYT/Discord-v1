const { SlashCommandBuilder, EmbedBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('View server-wide statistics'),

  async execute(interaction, client, db) {
    await interaction.deferReply();
    const members = await interaction.guild.members.fetch();
    let totalMessages = 0, totalVoice = 0, totalReactions = 0, activeUsers = 0;
    for (const [memberId
        ] of members) {
      const stats = await db.get(`stats_${interaction.guild.id
            }_${memberId
            }`);
      if (stats) {
        totalMessages += stats.messages || 0; totalVoice += stats.voiceTime || 0;
        totalReactions += stats.reactions || 0;
        if (stats.messages > 0 || stats.voiceTime > 0) activeUsers++;
            }
        }
    const embed = new EmbedBuilder()
      .setColor('#0099FF').setTitle(`📊 ${interaction.guild.name
        } Statistics`)
      .setThumbnail(interaction.guild.iconURL({ size: 128
        }))
      .addFields(
        { name: '👥 Members', value: `${interaction.guild.memberCount
            }`, inline: true
        },
        { name: '📊 Active', value: `${activeUsers
            }`, inline: true
        },
        { name: '\u200b', value: '\u200b', inline: true
        },
        { name: '📝 Messages', value: totalMessages.toLocaleString(), inline: true
        },
        { name: '🎤 Voice', value: `${(totalVoice / 3600000).toFixed(1)
            }h`, inline: true
        },
        { name: '❤️ Reactions', value: totalReactions.toLocaleString(), inline: true
        }
      ).setTimestamp();
    await interaction.editReply({ embeds: [embed
            ]
        });
    }
};
