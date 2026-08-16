const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBadges, getCommunityStats } = require('../../../shared/services/community');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('badges')
        .setDescription('View community badges and social stats')
        .addUserOption(opt => opt.setName('user').setDescription('Member to inspect')),

    async execute(interaction, client, db) {
        const user = interaction.options.getUser('user') || interaction.user;
        const stats = await getCommunityStats(db, interaction.guild.id, user.id);
        const badges = getBadges(stats);
        const badgeText = badges.length
            ? badges.map(badge => `**${badge.name}** — ${badge.description}`).join('\n')
            : 'No badges yet. Use `/streak`, earn reputation, and participate to unlock them.';

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle(`${user.username}'s Community Badges`)
                    .setThumbnail(user.displayAvatarURL({ size: 128 }))
                    .setDescription(badgeText)
                    .addFields(
                        { name: 'Current streak', value: `${stats.streak.current} days`, inline: true },
                        { name: 'Best streak', value: `${stats.streak.best} days`, inline: true },
                        { name: 'Reputation', value: String(stats.rep), inline: true },
                        { name: 'Points', value: String(stats.points), inline: true }
                    )
                    .setTimestamp()
            ]
        });
    }
};