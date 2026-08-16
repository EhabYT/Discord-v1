const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qr')
        .setDescription('Generate a QR code for text or a URL')
        .addStringOption(opt => opt.setName('text').setDescription('The text or URL to encode').setRequired(true)),

    async execute(interaction, client, db) {
        const text = interaction.options.getString('text');
        const { safeReply } = client.helpers;

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`;

        const embed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setTitle('📥 QR Code Generated')
            .setDescription(`Generated for: \`${text.length > 50 ? text.substring(0, 47) + '...' : text}\``)
            .setImage(qrUrl)
            .setFooter({ text: 'Powered by QRServer' })
            .setTimestamp();

        await safeReply(interaction, { embeds: [embed] });
    }
};
