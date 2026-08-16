const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove a role from a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub => sub.setName('add').setDescription('Give a role')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove').setDescription('Take a role')
            .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return client.helpers.safeReply(interaction, { content: '❌ Member not found.', flags: [MessageFlags.Ephemeral] });
        if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
            return client.helpers.safeReply(interaction, { content: '❌ I cannot manage that role.', flags: [MessageFlags.Ephemeral] });
        }
        if (role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
            return client.helpers.safeReply(interaction, { content: '❌ That role is above yours.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            if (sub === 'add') await member.roles.add(role, `By ${interaction.user.tag}`);
            else await member.roles.remove(role, `By ${interaction.user.tag}`);
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setDescription(`${sub === 'add' ? '✅ Added' : '🗑️ Removed'} ${role} ${sub === 'add' ? 'to' : 'from'} ${member}.`)
                .setTimestamp();
            await client.helpers.safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            await client.helpers.safeReply(interaction, { content: `❌ ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
