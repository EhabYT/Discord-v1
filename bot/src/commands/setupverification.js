const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupverification')
        .setDescription('Setup a verification system for your server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send the verification message in')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to give to verified users')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title of the verification embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description of the verification embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('button_label')
                .setDescription('Label for the verification button')
                .setRequired(false)),

    async execute(interaction, client, db) {
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const title = interaction.options.getString('title') || 'Server Verification';
        const description = interaction.options.getString('description') || 'Please click the button below to verify yourself and gain access to the server.';
        const buttonLabel = interaction.options.getString('button_label') || 'Verify';

        // Check if bot has permission to manage roles and if the role is lower than the bot's highest role
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: '❌ I do not have permission to manage roles.', flags: [MessageFlags.Ephemeral] });
        }

        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ content: '❌ I cannot assign this role because it is higher than or equal to my highest role.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            const verify = require('../../../shared/services/verification');
            const current = await verify.getConfig(db, interaction.guild.id);
            await verify.saveConfig(db, interaction.guild.id, {
                ...current,
                enabled: true,
                roleId: role.id,
                channelId: channel.id,
                title,
                description,
                buttonLabel,
            });

            // Create Embed and Button
            const embed = new EmbedBuilder()
                .setColor(require('../../../config/bot.json').colors?.success || '#00FF00')
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verification_entry')
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

            // Send to the specified channel
            await channel.send({ embeds: [embed], components: [row] });

            await interaction.reply({ content: `✅ Verification system setup successfully in ${channel}. Users will receive the ${role} role.`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            require('../../../shared/lib/logger').error('Verification setup failed', { error: error.message });
            await client.helpers.safeReply(interaction, { content: '❌ An error occurred while setting up the verification system.', flags: [MessageFlags.Ephemeral] });
        }
    }
};
