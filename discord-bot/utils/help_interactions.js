const { EmbedBuilder, MessageFlags } = require('discord.js');

async function handleHelpSelect(interaction) {
    const categories = {
        moderation: {
            title: '🛡️ Moderation Commands',
            desc: 'Commands for keeping your server safe and clean.',
            cmds: '`ban`, `kick`, `timeout`, `unban`, `untimeout`, `warn`, `warnings`, `removewarn`, `clear`, `setnick`'
        },
        automod: {
            title: '🤖 AutoMod Suite',
            desc: 'Automated protection filters and system controls.',
            cmds: '`automod`, `automod-config`, `whitelist`, `lock`, `unlock`, `slowmode`'
        },
        utility: {
            title: '🛠️ Utility Tools',
            desc: 'Essential tools for server management and info.',
            cmds: '`ping`, `help`, `info`, `avatar`, `userinfo`, `serverinfo`, `poll`, `remind`, `membercount`, `qr`'
        },
        music: {
            title: '🎵 Music Player',
            desc: 'High-quality audio streaming from multiple sources.',
            cmds: '`play`, `stop`, `skip`, `pause`, `resume`, `queue`, `nowplaying`, `volume`, `shuffle`, `loop`'
        },
        fun: {
            title: '🎲 Fun & Games',
            desc: 'Interactive commands for server engagement.',
            cmds: '`coinflip`, `roll`, `rep`, `points`'
        },
        tickets: {
            title: '🎫 Ticket System',
            desc: 'Professional support request management.',
            cmds: '`ticket-setup`, `ticket-panel`, `ticket-add`, `ticket-remove`, `ticket-close`'
        },
        logging: {
            title: '📜 Logging System',
            desc: 'Detailed audit trails for server events.',
            cmds: '`logging-setup`, `logging-status`, `logging-disable`'
        },
        engagement: {
            title: '🏆 Engagement Tools',
            desc: 'Boost activity with rewards and giveaways.',
            cmds: '`stats`, `leaderboard`, `serverstats`, `reactionrole-setup`, `/giveaway start`, `/giveaway info`, `/giveaway reroll`'
        },
        community: {
            title: '💬 Community & Social',
            desc: 'Give members more ways to connect and participate.',
            cmds: '`confess`, `suggest`, `ship`, `wouldyourather`, `truthordare`, `daily`, `streak`, `badges`'
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
