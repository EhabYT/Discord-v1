const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getDailyQuestion } = require('../../../shared/services/community');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Post the daily community question'),

    execute(interaction) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('Daily Community Question')
                    .setDescription(getDailyQuestion(interaction.guild.id))
                    .setFooter({ text: 'Share your answer with the community.' })
                    .setTimestamp()
            ]
        });
    }
};