const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jumbo')
        .setDescription('Enlarge a custom emoji')
        .addStringOption(opt => opt.setName('emoji').setDescription('Custom emoji').setRequired(true)),

    async execute(interaction, client) {
        const input = interaction.options.getString('emoji');
        const match = input.match(/<(a?):(\w+):(\d+)>/);
        if (!match) {
            return client.helpers.safeReply(interaction, { content: '❌ Send a custom server emoji.', flags: [MessageFlags.Ephemeral] });
        }
        const [, animated, name, id] = match;
        const ext = animated ? 'gif' : 'png';
        const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=256`;
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle(`:${name}:`)
            .setImage(url)
            .setURL(url);
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
