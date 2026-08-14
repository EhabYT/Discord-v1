const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Show invite stats for a member')
        .addUserOption(opt => opt.setName('user').setDescription('Member (default: you)')),
    defer: true,

    async execute(interaction, client) {
        const user = interaction.options.getUser('user') || interaction.user;
        const invites = await interaction.guild.invites.fetch().catch(() => null);
        if (!invites) {
            return client.helpers.safeReply(interaction, { content: '❌ I need the Manage Server permission to view invites.', flags: [MessageFlags.Ephemeral] });
        }
        const mine = invites.filter(i => i.inviterId === user.id);
        const uses = mine.reduce((sum, i) => sum + (i.uses || 0), 0);
        const top = [...mine.values()].sort((a, b) => (b.uses || 0) - (a.uses || 0)).slice(0, 5);
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle('✉️ Invite stats')
            .addFields(
                { name: 'Total uses', value: `${uses}`, inline: true },
                { name: 'Active codes', value: `${mine.size}`, inline: true }
            )
            .setTimestamp();
        if (top.length) {
            embed.addFields({
                name: 'Top codes',
                value: top.map(i => `\`${i.code}\` — **${i.uses || 0}** uses`).join('\n')
            });
        }
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
