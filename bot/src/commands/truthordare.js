const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DARES, TRUTHS, getPrompt } = require('../../../shared/services/community');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('truthordare')
        .setDescription('Get a community-friendly truth or dare')
        .addStringOption(opt => opt
            .setName('type')
            .setDescription('Choose truth, dare, or let the bot choose')
            .addChoices(
                { name: 'Truth', value: 'truth' },
                { name: 'Dare', value: 'dare' },
                { name: 'Random', value: 'random' }
            )),

    execute(interaction) {
        const requested = interaction.options.getString('type') || 'random';
        const type = requested === 'random' ? (Math.random() < 0.5 ? 'truth' : 'dare') : requested;
        const prompt = getPrompt(type === 'truth' ? TRUTHS : DARES, interaction.guild.id);
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(type === 'truth' ? '#3498DB' : '#E67E22')
                    .setTitle(type === 'truth' ? 'Truth' : 'Dare')
                    .setDescription(prompt)
                    .setFooter({ text: `Requested by ${interaction.user.tag}` })
                    .setTimestamp()
            ]
        });
    }
};