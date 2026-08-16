const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('text').setDescription('What to say').setRequired(true).setMaxLength(2000))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)),

    async execute(interaction, client) {
        const text = interaction.options.getString('text');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        await channel.send({ content: text, allowedMentions: { parse: [] } });
        await client.helpers.safeReply(interaction, { content: `✅ Sent in ${channel}.`, flags: [MessageFlags.Ephemeral] });
    }
};
