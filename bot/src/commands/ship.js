const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function compatibility(first, second) {
    const ids = [first.id, second.id].sort().join(':');
    let hash = 0;
    for (const char of ids) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return 50 + Math.abs(hash) % 51;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calculate the compatibility between two members')
        .addUserOption(opt => opt.setName('first').setDescription('First member').setRequired(true))
        .addUserOption(opt => opt.setName('second').setDescription('Second member').setRequired(true)),

    execute(interaction) {
        const first = interaction.options.getUser('first');
        const second = interaction.options.getUser('second');
        const score = compatibility(first, second);
        const filled = Math.round(score / 10);
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
        const verdict = score >= 90 ? 'Perfect match' : score >= 75 ? 'Strong chemistry' : score >= 60 ? 'Worth a chance' : 'Better as friends';

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(score >= 75 ? '#FF69B4' : '#9B59B6')
                    .setTitle('Compatibility Check')
                    .setDescription(`${first} + ${second}\n\n**${bar} ${score}%**\n${verdict}`)
                    .setTimestamp()
            ]
        });
    }
};