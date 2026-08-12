const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

function suggestionEmbed(suggestion, status = suggestion.status) {
    const colors = { pending: '#00FFFF', approved: '#2ECC71', denied: '#E74C3C' };
    return new EmbedBuilder()
        .setColor(colors[status] || colors.pending)
        .setTitle(`Suggestion #${suggestion.id}`)
        .setDescription(suggestion.message)
        .setAuthor(suggestion.anonymous ? { name: 'Anonymous member' } : { name: suggestion.authorTag })
        .setFooter({ text: `${status.toUpperCase()} • React with 👍 or 👎` })
        .setTimestamp(suggestion.createdAt);
}

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
        )
        .addSubcommand(sub => sub
            .setName('deny')
            .setDescription('Deny a suggestion')
            .addStringOption(opt => opt.setName('id').setDescription('Suggestion ID').setRequired(true))
        ),
    defer: true,
    ephemeral: true,

    async execute(interaction, client, db) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const key = `suggestions_${guildId}`;
        const suggestions = await db.get(key) || [];

        if (subcommand === 'create') {
            const message = interaction.options.getString('message').trim();
            if (!message) {
                return interaction.editReply({
                    content: 'Your suggestion cannot be empty.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            const anonymous = interaction.options.getBoolean('anonymous') ?? false;
            const id = `${Date.now().toString(36).slice(-6)}`;
            const suggestion = {
                id,
                message,
                anonymous,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                channelId: interaction.channel.id,
                messageId: null,
                status: 'pending',
                createdAt: Date.now()
            };

            const posted = await interaction.channel.send({
                embeds: [suggestionEmbed(suggestion)],
                allowedMentions: { parse: [] }
            });
            await posted.react('👍');
            await posted.react('👎');
            suggestion.messageId = posted.id;
            suggestions.push(suggestion);
            await db.set(key, suggestions);

            return interaction.editReply({
                content: `Suggestion #${id} submitted${anonymous ? ' anonymously' : ''}.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'list') {
            const pending = suggestions.filter(item => item.status === 'pending').slice(-10).reverse();
            const embed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('Pending Suggestions')
                .setDescription(
                    pending.length
                        ? pending.map(item => `**#${item.id}** — ${item.message.slice(0, 180)}`).join('\n')
                        : 'There are no pending suggestions.'
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        if (!client.helpers.hasModPerms(interaction.member)) {
            return interaction.editReply({
                content: 'Only moderators can approve or deny suggestions.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const id = interaction.options.getString('id');
        const suggestion = suggestions.find(item => item.id === id);
        if (!suggestion) {
            return interaction.editReply({ content: `Suggestion #${id} was not found.`, flags: [MessageFlags.Ephemeral] });
        }

        const status = subcommand === 'approve' ? 'approved' : 'denied';
        suggestion.status = status;
        suggestion.reviewedBy = interaction.user.id;
        suggestion.reviewedAt = Date.now();
        await db.set(key, suggestions);

        const channel = await interaction.guild.channels.fetch(suggestion.channelId).catch(() => null);
        const posted = channel ? await channel.messages.fetch(suggestion.messageId).catch(() => null) : null;
        if (posted) await posted.edit({ embeds: [suggestionEmbed(suggestion, status)] }).catch(() => {});

        return interaction.editReply({
            content: `Suggestion #${id} marked as ${status}.`,
            flags: [MessageFlags.Ephemeral]
        });
    }
};