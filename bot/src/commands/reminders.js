const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminders')
        .setDescription('List or cancel your reminders')
        .addSubcommand(sub => sub.setName('list').setDescription('List your reminders'))
        .addSubcommand(sub => sub.setName('cancel').setDescription('Cancel a reminder')
            .addIntegerOption(o => o.setName('index').setDescription('Number from /reminders list').setRequired(true).setMinValue(1))),

    async execute(interaction, client, db) {
        const key = `reminders_${interaction.user.id}`;
        const list = (await db.get(key)) || [];
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            if (!list.length) {
                return client.helpers.safeReply(interaction, { content: '❌ You have no reminders.', flags: [MessageFlags.Ephemeral] });
            }
            const desc = list.map((r, i) =>
                `**${i + 1}.** ${r.reason}\n⏰ <t:${Math.floor(r.expiresAt / 1000)}:R>`
            ).join('\n\n');
            const embed = new EmbedBuilder().setColor('#00fbff').setTitle('⏰ Your reminders').setDescription(desc);
            return client.helpers.safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        const index = interaction.options.getInteger('index') - 1;
        if (!list[index]) {
            return client.helpers.safeReply(interaction, { content: '❌ No reminder at that index.', flags: [MessageFlags.Ephemeral] });
        }
        const removed = list.splice(index, 1)[0];
        await db.set(key, list);
        await client.helpers.safeReply(interaction, { content: `🗑️ Cancelled reminder: **${removed.reason}**`, flags: [MessageFlags.Ephemeral] });
    }
};
