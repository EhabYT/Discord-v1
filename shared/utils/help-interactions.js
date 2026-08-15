const { EmbedBuilder, MessageFlags } = require('discord.js');

async function handleHelpSelect(interaction) {
    const categories = {
        moderation: {
            title: '🛡️ Moderation Commands',
            desc: 'Commands for keeping your server safe and clean.',
            cmds: '`ban`, `softban`, `kick`, `timeout`, `warn`, `note`, `role`, `lockdown`, `snipe`, `editsnipe`, `announce`, `say`, `move`, `steal`'
        },
        automod: {
            title: '🤖 AutoMod Suite',
            desc: 'Automated protection filters and system controls.',
            cmds: '`automod`, `whitelist`, `lock`, `unlock`, `slowmode`'
        },
        utility: {
            title: '🛠️ Utility Tools',
            desc: 'Essential tools for server management and info.',
            cmds: '`ping`, `help`, `avatar`, `banner`, `userinfo`, `roleinfo`, `channelinfo`, `invites`, `define`, `math`, `qr`, `afk`, `remind`, `reminders`, `tag`, `jumbo`, `firstmessage`, `/tools` (`weather`, `wiki`, `github`, `crypto`, `encode`, `hash`…)'
        },
        music: {
            title: '🎵 Music Player',
            desc: 'High-quality audio streaming from multiple sources.',
            cmds: '`play`, `skip`, `stop`, `leave`, `pause`, `resume`, `queue`, `remove`, `seek`, `replay`, `nowplaying`, `volume`, `shuffle`, `loop`, `autoplay`, `lyrics`, `filters`'
        },
        fun: {
            title: '🎲 Fun & Games',
            desc: 'Interactive commands for server engagement.',
            cmds: '`/fun` (`8ball`, `joke`, `meme`, `cat`, `fox`, `roast`, `rate`…), `/games` (`trivia`, `hangman`, `blackjack`, `wordle`, `tictactoe`…), `coinflip`, `roll`, `ship`, `wouldyourather`, `truthordare`'
        },
        tickets: {
            title: '🎫 Ticket System',
            desc: 'Professional support request management.',
            cmds: '`ticket` (`setup`, `panel`, `add`, `remove`, `close`, `claim`, `rename`, `list`, `transcript`)'
        },
        verification: {
            title: '✅ Verification Gate',
            desc: 'Lock the server until members click Verify (or solve a captcha).',
            cmds: '`setupverification` · Dashboard → Verification: roles, captcha, auto-kick, lock, pending, logs'
        },
        roles: {
            title: '🎭 Reaction & Button Roles',
            desc: 'Let members pick roles with a click or a reaction.',
            cmds: '`reactionrole` (`setup`, `remove`, `list`) · Dashboard → Reaction Roles: button panels, exclusive groups'
        },
        birthdays: {
            title: '🎂 Birthdays',
            desc: 'Save dates and auto-announce with an optional 24h role.',
            cmds: '`birthday` (`set`, `view`, `remove`, `list`) · `birthdaysettings` · Dashboard → Birthdays'
        },
        logging: {
            title: '📜 Logging System',
            desc: 'Detailed audit trails for server events.',
            cmds: '`logging` (`setup`, `status`, `disable`), `snipe`, `editsnipe`'
        },
        engagement: {
            title: '🏆 Engagement Tools',
            desc: 'Boost activity with rewards and giveaways.',
            cmds: '`stats`, `leaderboard`, `giveaway`, `work`, `pay`, `slots`, `points`, `reactionrole`'
        },
        community: {
            title: '💬 Community & Social',
            desc: 'Give members more ways to connect and participate.',
            cmds: '`suggest` · `poll` · `confess` · `tag` · `announce` · `afk` · `remind` · Dashboard → Staff Board / Suggestions / Tags'
        }
    };

    const choice = interaction.values[0];
    const data = categories[choice];

    if (!data) return interaction.reply({ content: 'Category not found or invalid selection.', flags: [MessageFlags.Ephemeral] });

    const embed = new EmbedBuilder()
        .setColor('#00fbff')
        .setTitle(data.title)
        .setDescription(`${data.desc}\n\n**Commands:**\n${data.cmds}`)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    await interaction.update({ embeds: [embed] });
}

module.exports = { handleHelpSelect };
