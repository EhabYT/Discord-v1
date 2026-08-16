const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const board = require('../../../shared/services/staff-board');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send an announcement embed')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('message').setDescription('Announcement text').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption(opt => opt.setName('title').setDescription('Title'))
        .addBooleanOption(opt => opt.setName('ping').setDescription('Ping @everyone')),

    async execute(interaction, client, db) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        try {
            await board.postAnnouncement(interaction.guild, db, {
                channelId: channel.id,
                message: interaction.options.getString('message'),
                title: interaction.options.getString('title') || 'Announcement',
                ping: interaction.options.getBoolean('ping'),
                authorTag: interaction.user.username,
            });
            await client.helpers.safeReply(interaction, { content: `✅ Posted in ${channel}.`, flags: [MessageFlags.Ephemeral] });
        } catch (err) {
            await client.helpers.safeReply(interaction, { content: err.message || 'Could not post.', flags: [MessageFlags.Ephemeral] });
        }
    },
};
