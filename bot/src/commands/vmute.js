const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vmute')
        .setDescription('Server Mute a member in voice channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute')),

    async execute(interaction, client, db) {
        const logger = require('../../../shared/lib/logger');
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ User not found in this server.', flags: [MessageFlags.Ephemeral] });
        if (!member.voice.channel) return interaction.reply({ content: '❌ User is not currently in a voice channel.', flags: [MessageFlags.Ephemeral] });

        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot mute this member due to role hierarchy.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            await member.voice.setMute(true, `Muted by ${interaction.user.tag}: ${reason}`);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔇 Voice Muted')
                .setDescription(`${user} has been server muted.`)
                .addFields({ name: 'Reason', value: reason })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            logger.error('Vmute command failed', { error: err.message });
            await interaction.reply({ content: `❌ Failed to mute member: ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
