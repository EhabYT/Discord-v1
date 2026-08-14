const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Add a custom emoji to this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers)
        .addStringOption(opt => opt.setName('emoji').setDescription('Custom emoji to steal').setRequired(true))
        .addStringOption(opt => opt.setName('name').setDescription('Name on this server')),

    async execute(interaction, client) {
        const input = interaction.options.getString('emoji');
        const match = input.match(/<(a?):(\w+):(\d+)>/);
        if (!match) {
            return client.helpers.safeReply(interaction, { content: '❌ Paste a custom emoji.', flags: [MessageFlags.Ephemeral] });
        }
        const [, animated, original, id] = match;
        const name = (interaction.options.getString('name') || original).replace(/[^\w]/g, '').slice(0, 32);
        const ext = animated ? 'gif' : 'png';
        const url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
        try {
            const emoji = await interaction.guild.emojis.create({ attachment: url, name });
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle('✨ Emoji added')
                .setDescription(`${emoji} saved as \`:${emoji.name}:\``)
                .setThumbnail(emoji.imageURL())
                .setTimestamp();
            await client.helpers.safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            await client.helpers.safeReply(interaction, { content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
