const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('membercount')
        .setDescription('Show total members, humans, and bots in the server'),

    async execute(interaction, client, db) {
        const { guild } = interaction;
        const { safeReply } = client.helpers;

        const total = guild.memberCount;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = total - bots;

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`📊 Member Count for ${guild.name}`)
            .setThumbnail(guild.iconURL({ size: 128 }))
            .addFields(
                { name: 'Total Members', value: `\`${total.toLocaleString()}\``, inline: true },
                { name: 'Humans', value: `\`${humans.toLocaleString()}\``, inline: true },
                { name: 'Bots', value: `\`${bots.toLocaleString()}\``, inline: true }
            )
            .setTimestamp();

        await safeReply(interaction, { embeds: [embed] });
    }
};
