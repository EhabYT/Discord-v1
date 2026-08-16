const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Lock or unlock every text channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('action').setDescription('Lock or unlock').setRequired(true)
            .addChoices({ name: 'Lock', value: 'lock' }, { name: 'Unlock', value: 'unlock' }))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason')),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const action = interaction.options.getString('action');
        const reason = interaction.options.getString('reason') || 'Lockdown';
        const lock = action === 'lock';
        const channels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement);
        let ok = 0;
        for (const [, ch] of channels) {
            try {
                await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: lock ? false : null }, { reason });
                ok++;
            } catch { /* skip */ }
        }
        const embed = new EmbedBuilder()
            .setColor(lock ? '#FF0000' : '#00FF00')
            .setTitle(lock ? '🔒 Server lockdown' : '🔓 Lockdown lifted')
            .setDescription(`Updated **${ok}** channels.\n**Reason:** ${reason}`)
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
};
