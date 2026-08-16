const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const tags = require('../../../shared/services/tags');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Custom server tags')
        .addSubcommand(sub => sub.setName('get').setDescription('Show a tag')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
        .addSubcommand(sub => sub.setName('set').setDescription('Create or update a tag')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setMaxLength(32))
            .addStringOption(o => o.setName('content').setDescription('Tag content').setRequired(true).setMaxLength(1500)))
        .addSubcommand(sub => sub.setName('delete').setDescription('Delete a tag')
            .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
        .addSubcommand(sub => sub.setName('list').setDescription('List all tags')),

    async execute(interaction, client, db) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'list') {
            const list = await tags.list(db, guildId);
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle('🏷️ Server tags')
                .setDescription(list.length ? list.map((t) => `\`${t.name}\``).join(', ') : 'No tags yet. Use `/tag set` or the dashboard.')
                .setTimestamp();
            return client.helpers.safeReply(interaction, { embeds: [embed] });
        }

        const name = interaction.options.getString('name');

        if (sub === 'get') {
            const tag = await tags.get(db, guildId, name);
            if (!tag) return client.helpers.safeReply(interaction, { content: `❌ Tag \`${tags.normalize(name)}\` not found.`, flags: [MessageFlags.Ephemeral] });
            return interaction.reply({ content: tag.content, allowedMentions: { parse: [] } });
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return client.helpers.safeReply(interaction, { content: '❌ Manage Messages required to edit tags.', flags: [MessageFlags.Ephemeral] });
        }

        if (sub === 'delete') {
            try {
                await tags.remove(db, guildId, name);
                return client.helpers.safeReply(interaction, { content: `🗑️ Deleted tag \`${tags.normalize(name)}\`.` });
            } catch (err) {
                return client.helpers.safeReply(interaction, { content: `❌ ${err.message}`, flags: [MessageFlags.Ephemeral] });
            }
        }

        const saved = await tags.upsert(db, guildId, name, interaction.options.getString('content'), interaction.user.id);
        await client.helpers.safeReply(interaction, { content: `✅ Saved tag \`${saved.name}\`.` });
    },
};
