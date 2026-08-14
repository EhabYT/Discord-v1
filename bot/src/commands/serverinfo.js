const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display server information'),

    async execute(interaction, client, db) {
        const { guild } = interaction;
        const owner = await guild.fetchOwner().catch(() => null);
        const channels = guild.channels.cache;
        const roles = guild.roles.cache;
        const emojis = guild.emojis.cache;

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`🏢 Server Info: ${guild.name}`)
            .setThumbnail(guild.iconURL({ size: 1024 }))
            .addFields(
                { name: 'Owner', value: owner ? `${owner}` : 'Unknown', inline: true },
                { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'ID', value: guild.id, inline: true },
                { name: 'Members', value: `${guild.memberCount}`, inline: true },
                { name: 'Roles', value: `${roles.size}`, inline: true },
                { name: 'Emojis', value: `${emojis.size}`, inline: true },
                { name: 'Channels', value: `💬 Text: ${channels.filter(c => c.type === ChannelType.GuildText).size}\n🔊 Voice: ${channels.filter(c => c.type === ChannelType.GuildVoice).size}\n📁 Categories: ${channels.filter(c => c.type === ChannelType.GuildCategory).size}` }
            )
            .setTimestamp();

        if (guild.bannerURL()) embed.setImage(guild.bannerURL());
        await interaction.reply({ embeds: [embed] });
    }
};
