const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeReply } = require('../utils/helpers');

module.exports = {
      data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Explore EB Bot’s power — commands and utilities'),

      async execute(interaction, client, db) {
            const categories = {
                  Moderation: { emoji: '🛡️', commands: '`ban`, `kick`, `timeout`, `unban`, `untimeout`, `warn`, `warnings`, `removewarn`, `clear`, `setnick`' },
                  AutoMod: { emoji: '🤖', commands: '`automod`, `whitelist` , `lock`, `unlock`, `slowmode`' },
                  Utility: { emoji: '🛠️', commands: '`ping`, `help`, `info`, `avatar`, `userinfo`, `serverinfo`, `poll`, `remind`, `membercount`, `qr`' },
                  Music: { emoji: '🎵', commands: '`play`, `stop`, `skip`, `pause`, `resume`, `queue`, `nowplaying`, `volume`, `shuffle`, `loop`, `autoplay`, `lyrics`' },
                  Fun: { emoji: '🎲', commands: '`coinflip`, `roll` , `rep`, `points`' },
                  Tickets: { emoji: '🎫', commands: '`ticket setup`, `ticket panel`, `ticket add`, `ticket remove`, `ticket close`' },
                  Logging: { emoji: '📜', commands: '`logging-setup`, `logging-status`, `logging-disable`' },
                  Engagement: { emoji: '🏆', commands: '`stats`, `leaderboard`, `serverstats`, `reactionrole-setup`, `/giveaway start`, `/giveaway info`, `/giveaway reroll`' },
                  Community: { emoji: '💬', commands: '`confess`, `suggest`, `ship`, `wouldyourather`, `truthordare`, `daily`, `streak`, `badges`' }
            };

            const embed = new EmbedBuilder()
                  .setColor('#00fbff')
                  .setTitle('📚 EB Bot — Command Center')
                  .setDescription('Welcome to the command hub! Select a category from the menu below to explore specifically what I can do for your community.')
                  .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
                  .setFooter({ text: 'EB Bot Pro — Premium Support Enabled', iconURL: client.user.displayAvatarURL() })
                  .setTimestamp();

            const select = new StringSelectMenuBuilder()
                  .setCustomId('help_category')
                  .setPlaceholder('📂 Choose a category to explore...')
                  .addOptions(Object.keys(categories).map(cat => ({
                        label: cat,
                        value: cat.toLowerCase(),
                        emoji: categories[cat].emoji,
                        description: `View commands for ${cat}`
                  })));

            const rowSelect = new ActionRowBuilder().addComponents(select);

            // Dynamic Dashboard URL
            const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';

            const rowButtons = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                        .setLabel('Invite the bot')
                        .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
                        .setStyle(ButtonStyle.Link),
                  new ButtonBuilder()
                        .setLabel('Support Server')
                        .setURL('https://discord.gg/placeholder')
                        .setStyle(ButtonStyle.Link),
                  new ButtonBuilder()
                        .setLabel('Dashboard')
                        .setURL(dashboardUrl)
                        .setStyle(ButtonStyle.Link)
            );

            await safeReply(interaction, {
                  embeds: [embed],
                  components: [rowSelect, rowButtons]
            });
      }
};
