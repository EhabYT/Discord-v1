const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { randomUUID } = require('crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('note')
        .setDescription('Staff notes on a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand(sub => sub.setName('add').setDescription('Add a note')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addStringOption(o => o.setName('text').setDescription('Note').setRequired(true).setMaxLength(500)))
        .addSubcommand(sub => sub.setName('list').setDescription('List notes')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove').setDescription('Delete one note by number')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addIntegerOption(o => o.setName('index').setDescription('Note number from /note list').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('clear').setDescription('Clear all notes')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))),

    async execute(interaction, client, db) {
        const sub = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user');
        const key = `notes_${interaction.guild.id}_${user.id}`;
        const notes = (await db.get(key)) || [];

        if (sub === 'add') {
            const text = interaction.options.getString('text');
            notes.push({ id: randomUUID().split('-')[0], text, mod: interaction.user.tag, ts: Date.now() });
            // Cap growth to match the dashboard endpoint.
            await db.set(key, notes.slice(-200));
            return client.helpers.safeReply(interaction, {
                embeds: [new EmbedBuilder().setColor('#00fbff').setDescription(`📝 Note added for ${user}. (${notes.length} total)`)]
            });
        }

        if (sub === 'remove') {
            const index = interaction.options.getInteger('index') - 1;
            if (index < 0 || index >= notes.length) {
                return client.helpers.safeReply(interaction, { content: '❌ That note number does not exist.', flags: [MessageFlags.Ephemeral] });
            }
            const removed = notes.splice(index, 1)[0];
            await db.set(key, notes);
            return client.helpers.safeReply(interaction, {
                embeds: [new EmbedBuilder().setColor('#FFA500').setDescription(`🗑️ Deleted note: ${removed.text}`)]
            });
        }

        if (sub === 'clear') {
            await db.set(key, []);
            return client.helpers.safeReply(interaction, {
                embeds: [new EmbedBuilder().setColor('#FFA500').setDescription(`🗑️ Cleared notes for ${user}.`)]
            });
        }

        if (!notes.length) {
            return client.helpers.safeReply(interaction, { content: `❌ No notes for ${user}.`, flags: [MessageFlags.Ephemeral] });
        }
        const desc = notes.slice(-10).map((n, i) =>
            `**${i + 1}.** ${n.text}\n*${n.mod} · <t:${Math.floor((n.ts || 0) / 1000)}:R>*`
        ).join('\n\n');
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle(`Notes · ${user.username}`)
            .setDescription(desc)
            .setFooter({ text: `${notes.length} note(s)` });
        await client.helpers.safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }
};
