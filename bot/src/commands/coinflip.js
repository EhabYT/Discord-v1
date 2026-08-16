const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin!'),

    async execute(interaction, client, db) {
        const { safeReply } = client.helpers;
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        const icon = result === 'Heads' ? '🪙' : '📀';

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`${icon} Coin Flip`)
            .setDescription(`The coin landed on: **${result}**!`)
            .setTimestamp();

        await safeReply(interaction, { embeds: [embed] });
    }
};
