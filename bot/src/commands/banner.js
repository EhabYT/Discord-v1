const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banner')
        .setDescription('Show a user or server banner')
        .addUserOption(opt => opt.setName('user').setDescription('User (leave empty for server banner)')),

    async execute(interaction, client) {
        const userOpt = interaction.options.getUser('user');
        if (userOpt) {
            const user = await client.users.fetch(userOpt.id, { force: true }).catch(() => null);
            const url = user?.bannerURL({ size: 1024 });
            if (!url) {
                return client.helpers.safeReply(interaction, { content: '❌ That user has no banner.', flags: [MessageFlags.Ephemeral] });
            }
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle(`${user.username}'s banner`)
                .setImage(url)
                .setURL(url);
            return client.helpers.safeReply(interaction, { embeds: [embed] });
        }

        const bannerUrl = interaction.guild.bannerURL({ size: 1024 });
        const iconUrl = interaction.guild.iconURL({ size: 1024 });
        const url = bannerUrl || iconUrl;
        if (!url) {
            return client.helpers.safeReply(interaction, { content: '❌ This server has no banner or icon.', flags: [MessageFlags.Ephemeral] });
        }
        const kind = bannerUrl ? 'banner' : 'icon';
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle(`${interaction.guild.name} ${kind}`)
            .setImage(url)
            .setURL(url);
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
