const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const polls = require('../../../shared/services/polls');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll')
        .addStringOption(opt => opt.setName('question').setDescription('Question').setRequired(true).setMaxLength(300))
        .addStringOption(opt => opt.setName('options').setDescription('Options (separated by |)'))
        .addIntegerOption(opt => opt.setName('minutes').setDescription('Auto-close after N minutes').setMinValue(1).setMaxValue(10080)),

    async execute(interaction, client, db) {
        const question = interaction.options.getString('question');
        const optionsStr = interaction.options.getString('options');
        const minutes = interaction.options.getInteger('minutes');
        const options = optionsStr
            ? optionsStr.split('|').map((o) => o.trim()).filter(Boolean)
            : [];
        if (options.length > 10) {
            return interaction.reply({ content: '❌ Maximum 10 options.', flags: [MessageFlags.Ephemeral] });
        }
        try {
            const poll = await polls.create(interaction.guild, db, {
                channelId: interaction.channel.id,
                question,
                options,
                durationMs: minutes ? minutes * 60 * 1000 : 0,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
            });
            return interaction.reply({
                content: `Poll #${poll.id} posted.`,
                flags: [MessageFlags.Ephemeral],
            });
        } catch (err) {
            return interaction.reply({
                content: err.message || 'Could not create poll.',
                flags: [MessageFlags.Ephemeral],
            });
        }
    },
};
