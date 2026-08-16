const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { updateStreak } = require('../../../shared/services/community');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('Claim your daily community streak'),

    async execute(interaction, client, db) {
        const streak = await updateStreak(db, interaction.guild.id, interaction.user.id);
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#F1C40F')
                    .setTitle('Community Streak')
                    .setDescription(
                        streak.claimedToday
                            ? `You are on a **${streak.current}-day streak**. Keep it going tomorrow.`
                            : `You already claimed today. Your current streak is **${streak.current} days**.`
                    )
                    .addFields({ name: 'Best streak', value: `${streak.best} days`, inline: true })
                    .setTimestamp()
            ]
        });
    }
};