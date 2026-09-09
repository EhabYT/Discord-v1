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

        // Validate the role is actually assignable (perms, managed, hierarchy).
        try {
            const verify = require('../../../../shared/services/verification');
            verify.assertRoleManageable(interaction.guild, role.id);
        } catch (err) {
            return interaction.reply({ content: `❌ ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }

        try {
            const verify = require('../../../../shared/services/verification');
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
                .setColor(require('../../../../shared/config/bot-config').config.colors?.success || '#00FF00')
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

            // Send to the specified channel and remember the panel so /panel edits
            // and dashboard updates reuse the same message instead of orphaning
            // dead Verify buttons that later reply "not set up".
            const sent = await channel.send({ embeds: [embed], components: [row] });
            const latest = await verify.getConfig(db, interaction.guild.id);
            await verify.saveConfig(db, interaction.guild.id, {
                ...latest,
                enabled: true,
                roleId: role.id,
                channelId: channel.id,
                messageId: sent.id,
                title,
                description,
                buttonLabel,
            });

            await interaction.reply({ content: `✅ Verification system setup successfully in ${channel}. Users will receive the ${role} role.`, flags: [MessageFlags.Ephemeral] });

        } catch (error) {
            require('../../../../shared/lib/logger').error('Verification setup failed', { error: error.message });
            await client.helpers.safeReply(interaction, { content: '❌ An error occurred while setting up the verification system.', flags: [MessageFlags.Ephemeral] });
        }
    }
};

