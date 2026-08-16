const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('firstmessage')
        .setDescription('Jump to the first message in this channel'),
    defer: true,

    async execute(interaction, client) {
        const messages = await interaction.channel.messages.fetch({ after: '0', limit: 1 }).catch(() => null);
        const first = messages?.first();
        if (!first) {
            return client.helpers.safeReply(interaction, { content: '❌ Could not find the first message.', flags: [MessageFlags.Ephemeral] });
        }
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('📜 First message')
            .setDescription(first.content?.slice(0, 400) || '*No text*')
            .addFields(
                { name: 'Author', value: `${first.author}`, inline: true },
                { name: 'When', value: `<t:${Math.floor(first.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Jump', value: `[Open](${first.url})` }
            )
            .setTimestamp(first.createdTimestamp);
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
