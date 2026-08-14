const { SlashCommandBuilder, EmbedBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View server leaderboard')
    .addStringOption(opt => opt.setName('type').setDescription('Type')
      .addChoices({ name: 'Messages', value: 'messages'
    },
    { name: 'Voice', value: 'voice'
    },
    { name: 'Total', value: 'total'
    })),

  async execute(interaction, client, db) {
    const type = interaction.options.getString('type') || 'total';
    await interaction.deferReply();
    const members = await interaction.guild.members.fetch();
    const entries = [];
    for (const [memberId
        ] of members) {
      const stats = await db.get(`stats_${interaction.guild.id
            }_${memberId
            }`) || { messages: 0, voiceTime: 0, reactions: 0
            };
      let value = 0;
      if (type === 'messages') value = stats.messages;
      else if (type === 'voice') value = Math.floor(stats.voiceTime / 60000);
      else value = stats.messages + Math.floor(stats.voiceTime / 60000) + stats.reactions;
      if (value > 0) {entries.push({ userId: memberId, value
            });}
        }
    entries.sort((a, b) => b.value - a.value);
    const top10 = entries.slice(0,
        10);
    const medals = ['🥇', '🥈', '🥉'
        ];
    const description = top10.length > 0
      ? top10.map((e, i) => `${medals[i
            ] || `**${i + 1
            }.**`
        } <@${e.userId
        }> — ${type === 'voice' ? `${e.value
            } min` : e.value.toLocaleString()
        }`).join('\n')
      : 'No data yet.';
    const titles = { messages: '📝 Messages', voice: '🎤 Voice Time', total: '🏆 Total'
        };
    const embed = new EmbedBuilder().setColor('#FFD700').setTitle(`${titles[type
            ]
        } Leaderboard`).setDescription(description).setTimestamp();
    await interaction.editReply({ embeds: [embed
            ]
        });
    }
};
