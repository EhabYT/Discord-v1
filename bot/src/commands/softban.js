const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Ban then immediately unban to delete recent messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason')),

    async execute(interaction, client) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        if (user.id === interaction.user.id || user.id === client.user.id) {
            return client.helpers.safeReply(interaction, { content: '❌ You cannot softban that user.', flags: [MessageFlags.Ephemeral] });
        }
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (member && !member.bannable) {
            return client.helpers.safeReply(interaction, { content: '❌ I cannot ban this user.', flags: [MessageFlags.Ephemeral] });
        }
        try {
            await interaction.guild.members.ban(user, { deleteMessageSeconds: 86400, reason: `Softban | ${reason} | ${interaction.user.tag}` });
            await interaction.guild.members.unban(user, 'Softban complete');
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle('🧹 User softbanned')
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})` },
                    { name: 'Reason', value: reason }
                )
                .setTimestamp();
            await client.helpers.safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            await client.helpers.safeReply(interaction, { content: `❌ ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
