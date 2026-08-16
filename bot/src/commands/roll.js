const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a die!')
        .addIntegerOption(opt => opt.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(100)),

    async execute(interaction, client, db) {
        const sides = interaction.options.getInteger('sides') || 6;
        const { safeReply } = client.helpers;

        const result = Math.floor(Math.random() * sides) + 1;

        const embed = new EmbedBuilder()
            .setColor('#00FF88')
            .setTitle('🎲 Dice Roll')
            .setDescription(`You rolled a **${result}** (d${sides})!`)
            .setTimestamp();

        await safeReply(interaction, { embeds: [embed] });
    }
};
