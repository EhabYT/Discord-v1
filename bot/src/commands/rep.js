const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Give reputation to a user')
    .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)),

  async execute(interaction, client, db) {
    const user = interaction.options.getUser('user');
    if (!user) {return interaction.reply({
      content: '❌ User not found.', flags: [MessageFlags.Ephemeral]
    });}
    if (user.id === interaction.user.id) {return interaction.reply({
      content: '❌ Cannot rep yourself.', flags: [MessageFlags.Ephemeral]
    });}
    const cooldownKey = `rep_cooldown_${interaction.guild.id
      }_${interaction.user.id
      } `;
    const lastRep = await db.get(cooldownKey);
    const now = Date.now();
    if (lastRep && now - lastRep < 86400000) {
      const remaining = 86400000 - (now - lastRep);
      return interaction.reply({
        content: `❌ Wait ${Math.floor(remaining / 3600000)
          }h ${Math.floor((remaining % 3600000) / 60000)
          } m.`, flags: [MessageFlags.Ephemeral]
      });
    }
    const repKey = `rep_${interaction.guild.id
      }_${user.id
      } `;
    const currentRep = (await db.get(repKey)) || 0;
    await db.set(repKey, currentRep + 1);
    await db.set(cooldownKey, now);
    const embed = new EmbedBuilder().setColor('#00FF00').setTitle('⭐ Reputation Given')
      .setDescription(`${interaction.user
        } gave + 1 rep to ${user
        } \n${user.tag
        } now has ** ${currentRep + 1
        }** rep.`).setTimestamp();
    await interaction.reply({
      embeds: [embed
      ]
    });
  }
};
