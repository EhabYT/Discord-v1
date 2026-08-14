const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
      data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Explore EB Bot’s power — commands and utilities'),

      async execute(interaction, client, db) {
            const categories = {
                  Moderation: { emoji: '🛡️', commands: '`ban`, `softban`, `kick`, `timeout`, `warn`, `warnings` (`list`, `remove`, `clear`), `removewarn`, `note`, `role`, `lockdown`, `snipe`, `announce`, `say`, `move`, `steal`' },
                  AutoMod: { emoji: '🤖', commands: '`automod`, `whitelist`, `lock`, `unlock`, `slowmode`' },
                  Utility: { emoji: '🛠️', commands: '`ping`, `help`, `avatar`, `banner`, `userinfo`, `roleinfo`, `channelinfo`, `invites`, `define`, `math`, `qr`, `afk`, `remind`, `reminders`, `tag`, `jumbo`, `firstmessage`, `/tools` (`weather`, `wiki`, `github`, `npm`, `crypto`, `currency`, `encode`, `hash`, `uuid`, `timestamp`…)' },
                  Music: { emoji: '🎵', commands: '`play`, `skip`, `stop`, `leave`, `pause`, `resume`, `queue`, `remove`, `seek`, `replay`, `nowplaying`, `volume`, `shuffle`, `loop`, `autoplay`, `lyrics`' },
                  Fun: { emoji: '🎲', commands: '`/fun` (`8ball`, `joke`, `meme`, `cat`, `fox`, `roast`, `rate`…), `/games` (`trivia`, `hangman`, `blackjack`, `wordle`, `tictactoe`…), `coinflip`, `roll`, `ship`, `wouldyourather`, `truthordare`' },
                  Tickets: { emoji: '🎫', commands: '`ticket` (`setup`, `panel`, `add`, `remove`, `close`, `claim`, `rename`, `list`, `transcript`)' },
                  Verification: { emoji: '✅', commands: '`setupverification` + Dashboard → Verification (gate, captcha, lock, pending, logs)' },
                  Roles: { emoji: '🎭', commands: '`reactionrole` (`setup`, `remove`, `list`) + Dashboard → Reaction Roles (buttons, exclusive groups)' },
                  Birthdays: { emoji: '🎂', commands: '`birthday` (`set`, `view`, `remove`, `list`) · `birthdaysettings` · Dashboard → Birthdays' },
                  Logging: { emoji: '📜', commands: '`logging` (`setup`, `status`, `disable`), `snipe`, `editsnipe`' },
                  Engagement: { emoji: '🏆', commands: '`stats`, `leaderboard`, `giveaway`, `reactionrole`, `work`, `pay`, `slots`, `points`' },
                  Community: { emoji: '💬', commands: '`suggest` · `poll` · `confess` · `tag` · `announce` · `afk` · `remind` + Dashboard → Staff Board / Suggestions / Tags' }
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

            // Live file first so /help stays current after a tunnel restart
            const { readPublicUrl } = require('../../../shared/services/public-url');
            const dashboardUrl = readPublicUrl();
            const invitePerms = '1099915279415';

            const buttons = [
                  new ButtonBuilder()
                        .setLabel('Invite the bot')
                        .setURL(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=${invitePerms}&scope=bot%20applications.commands`)
                        .setStyle(ButtonStyle.Link)
            ];
            if (process.env.SUPPORT_INVITE && /^https:\/\/discord\.gg\/[\w-]+$/.test(process.env.SUPPORT_INVITE)) {
                  buttons.push(new ButtonBuilder()
                        .setLabel('Support Server')
                        .setURL(process.env.SUPPORT_INVITE)
                        .setStyle(ButtonStyle.Link));
            }
            if (dashboardUrl) {
                  buttons.push(new ButtonBuilder()
                        .setLabel('Dashboard')
                        .setURL(dashboardUrl)
                        .setStyle(ButtonStyle.Link));
            }

            const rowButtons = new ActionRowBuilder().addComponents(buttons);

            await safeReply(interaction, {
                  embeds: [embed],
                  components: [rowSelect, rowButtons]
            });
      }
};
