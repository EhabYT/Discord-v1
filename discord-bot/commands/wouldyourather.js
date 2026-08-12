const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWouldYouRather } = require('../utils/community_service');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wouldyourather')
        .setDescription('Ask the server a Would You Rather question')
        .addStringOption(opt => opt.setName('option_a').setDescription('Custom option A').setMaxLength(120))
        .addStringOption(opt => opt.setName('option_b').setDescription('Custom option B').setMaxLength(120)),

    async execute(interaction) {
        let optionA = interaction.options.getString('option_a');
        let optionB = interaction.options.getString('option_b');
        if ((optionA && !optionB) || (!optionA && optionB)) {
            return interaction.reply({ content: 'Please provide both option_a and option_b, or neither.', ephemeral: true });
        }
        if (!optionA && !optionB) [optionA, optionB] = getWouldYouRather(interaction.guild.id);

        const message = await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Would You Rather?')
                    .setDescription(`🇦 **${optionA}**\n\n🇧 **${optionB}**`)
                    .setFooter({ text: `Asked by ${interaction.user.tag}` })
                    .setTimestamp()
            ],
            fetchReply: true
        });
        await message.react('🇦');
        await message.react('🇧');
    }
};