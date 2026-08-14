const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Send points to another member')
        .addUserOption(opt => opt.setName('user').setDescription('Recipient').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1).setMaxValue(1000000)),

    async execute(interaction, client, db) {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (target.bot || target.id === interaction.user.id) {
            return client.helpers.safeReply(interaction, { content: '❌ You cannot pay that user.', flags: [MessageFlags.Ephemeral] });
        }
        const fromKey = `points_${interaction.guild.id}_${interaction.user.id}`;
        const toKey = `points_${interaction.guild.id}_${target.id}`;
        const balance = Number(await db.get(fromKey)) || 0;
        if (balance < amount) {
            return client.helpers.safeReply(interaction, { content: `❌ You only have **${balance}** points.`, flags: [MessageFlags.Ephemeral] });
        }
        await db.set(fromKey, balance - amount);
        await db.set(toKey, (Number(await db.get(toKey)) || 0) + amount);
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('💸 Payment sent')
            .setDescription(`${interaction.user} sent **${amount}** points to ${target}.`)
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
