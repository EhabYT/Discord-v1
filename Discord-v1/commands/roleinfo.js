const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Show details about a role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)),

    async execute(interaction, client) {
        const role = interaction.options.getRole('role');
        const embed = new EmbedBuilder()
            .setColor(role.hexColor === '#000000' ? '#00fbff' : role.hexColor)
            .setTitle(`Role · ${role.name}`)
            .addFields(
                { name: 'ID', value: role.id, inline: true },
                { name: 'Color', value: role.hexColor, inline: true },
                { name: 'Members', value: `${role.members.size}`, inline: true },
                { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                { name: 'Position', value: `${role.position}`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true }
            )
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }
};
