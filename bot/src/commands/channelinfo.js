const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

const TYPES = {
    [ChannelType.GuildText]: 'Text',
    [ChannelType.GuildVoice]: 'Voice',
    [ChannelType.GuildCategory]: 'Category',
    [ChannelType.GuildAnnouncement]: 'Announcement',
    [ChannelType.GuildStageVoice]: 'Stage',
    [ChannelType.GuildForum]: 'Forum',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channelinfo')
        .setDescription('Show details about a channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel (default: this one)')),

    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle(`# ${channel.name}`)
            .addFields(
                { name: 'ID', value: channel.id, inline: true },
                { name: 'Type', value: TYPES[channel.type] || String(channel.type), inline: true },
                { name: 'Created', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'NSFW', value: channel.nsfw ? 'Yes' : 'No', inline: true },
                { name: 'Topic', value: channel.topic || 'None' }
            )
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
