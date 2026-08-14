const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const suggestions = require('../../../shared/services/suggestions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Share and manage community suggestions')
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Submit a suggestion')
            .addStringOption(opt => opt.setName('message').setDescription('Your suggestion').setRequired(true).setMaxLength(1500))
            .addBooleanOption(opt => opt.setName('anonymous').setDescription('Hide your username'))
        )
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('Show pending suggestions')
        )
        .addSubcommand(sub => sub
            .setName('approve')
            .setDescription('Approve a suggestion')
            .addStringOption(opt => opt.setName('id').setDescription('Suggestion ID').setRequired(true))
            .addStringOption(opt => opt.setName('note').setDescription('Staff note').setMaxLength(500))
        )
        .addSubcommand(sub => sub
            .setName('deny')
            .setDescription('Deny a suggestion')
            .addStringOption(opt => opt.setName('id').setDescription('Suggestion ID').setRequired(true))
            .addStringOption(opt => opt.setName('note').setDescription('Staff note').setMaxLength(500))
        ),
    defer: true,
    ephemeral: true,

    async execute(interaction, client, db) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'create') {
            const cfg = await suggestions.getConfig(db, guildId);
            const anonymous = interaction.options.getBoolean('anonymous') ?? cfg.anonymousDefault;
            try {
                const item = await suggestions.create(interaction.guild, db, {
                    message: interaction.options.getString('message'),
                    anonymous,
                    channelId: cfg.channelId || interaction.channel.id,
                    authorId: interaction.user.id,
                    authorTag: interaction.user.tag,
                });
                return interaction.editReply({
                    content: `Suggestion #${item.id} submitted${anonymous ? ' anonymously' : ''}.`,
                    flags: [MessageFlags.Ephemeral],
                });
            } catch (err) {
                return interaction.editReply({ content: err.message || 'Could not post suggestion.', flags: [MessageFlags.Ephemeral] });
            }
        }

        if (subcommand === 'list') {
            const items = await suggestions.list(db, guildId);
            const pending = items.filter((item) => item.status === 'pending').slice(-10).reverse();
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('Pending Suggestions')
                .setDescription(
                    pending.length
                        ? pending.map((item) => `**#${item.id}** — ${item.message.slice(0, 180)}`).join('\n')
                        : 'There are no pending suggestions.'
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        if (!client.helpers.hasModPerms(interaction.member)) {
            return interaction.editReply({
                content: 'Only moderators can approve or deny suggestions.',
                flags: [MessageFlags.Ephemeral],
            });
        }

        const id = interaction.options.getString('id');
        const note = interaction.options.getString('note') || '';
        try {
            await suggestions.setStatus(interaction.guild, db, id, subcommand === 'approve' ? 'approved' : 'denied', {
                note,
                reviewedBy: interaction.user.tag,
            });
            return interaction.editReply({
                content: `Suggestion #${id} marked as ${subcommand === 'approve' ? 'approved' : 'denied'}.`,
                flags: [MessageFlags.Ephemeral],
            });
        } catch (err) {
            return interaction.editReply({ content: err.message || `Suggestion #${id} was not found.`, flags: [MessageFlags.Ephemeral] });
        }
    },
};
