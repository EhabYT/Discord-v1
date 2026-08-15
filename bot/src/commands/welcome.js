const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Manage welcome messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Setup welcome messages')
                .addChannelOption(opt => opt.setName('channel').setDescription('Welcome channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addStringOption(opt => opt.setName('message').setDescription('Message (use {user}, {server}, {memberCount})').setRequired(true))
                .addRoleOption(opt => opt.setName('auto_role').setDescription('Role to give on join'))
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Disable welcome messages')
        )
        .addSubcommand(sub =>
            sub.setName('test')
                .setDescription('Test the welcome message')
        ),

    async execute(interaction, client, db) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const message = interaction.options.getString('message');
            const autoRole = interaction.options.getRole('auto_role');

            await db.set(`welcome_${interaction.guild.id}`, {
                channelId: channel.id,
                message,
                autoRoleId: autoRole?.id,
                enabled: true
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Welcome System Configured')
                .addFields(
                    { name: 'Channel', value: `${channel}`, inline: true },
                    { name: 'Auto Role', value: autoRole ? `${autoRole}` : 'None', inline: true }
                )
                .setDescription(`**Message:**\n${message}`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'disable') {
            const config = await db.get(`welcome_${interaction.guild.id}`);
            if (config) {
                config.enabled = false;
                await db.set(`welcome_${interaction.guild.id}`, config);
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Welcome Messages Disabled')
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'test') {
            const config = await db.get(`welcome_${interaction.guild.id}`);

            if (!config || !config.enabled) {
                return interaction.reply({ content: '❌ Welcome system not setup or disabled.', flags: [MessageFlags.Ephemeral] });
            }

            let msg = config.message
                .replace(/{user}/g, interaction.user.toString())
                .replace(/{server}/g, interaction.guild.name)
                .replace(/{count}/g, interaction.guild.memberCount) // Standardized to {count} based on index.js logic
                .replace(/{memberCount}/g, interaction.guild.memberCount); // Support both for backward compatibility

            const channel = await interaction.guild.channels.fetch(config.channelId).catch(() => null);

            if (!channel) {
                return interaction.reply({ content: '❌ Welcome channel not found.', flags: [MessageFlags.Ephemeral] });
            }

            try {
                await channel.send(msg);
                return interaction.reply({ content: `✅ Test message sent to ${channel}!`, flags: [MessageFlags.Ephemeral] });
            } catch (err) {
                return interaction.reply({ content: `❌ Failed to send message: ${err.message}`, flags: [MessageFlags.Ephemeral] });
            }
        }
    }
};
