const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { safeReply } = require('../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Manage support tickets')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Configure the ticket system')
                .addChannelOption(opt => opt.setName('category').setDescription('Category to create tickets in').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
                .addChannelOption(opt => opt.setName('log_channel').setDescription('Log channel'))
                .addRoleOption(opt => opt.setName('support_role').setDescription('Support role'))
        )
        .addSubcommand(sub =>
            sub.setName('panel')
                .setDescription('Create a ticket panel')
        )
        .addSubcommand(sub =>
            sub.setName('close')
                .setDescription('Close the current ticket')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a user to the current ticket')
                .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a user from the current ticket')
                .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true))
        ),

    async execute(interaction, client, db) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const category = interaction.options.getChannel('category');
            const logChannel = interaction.options.getChannel('log_channel');
            const supportRole = interaction.options.getRole('support_role');

            await db.set(`tickets_${interaction.guild.id}`, {
                category: category.id,
                logChannel: logChannel?.id || null,
                supportRole: supportRole?.id || null,
                enabled: true
            });

            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle('✅ Ticket System Configured')
                .addFields(
                    { name: 'Category', value: `${category.name}`, inline: true },
                    { name: 'Log Channel', value: logChannel ? `${logChannel}` : 'Not set', inline: true },
                    { name: 'Support Role', value: supportRole ? `${supportRole}` : 'Not set', inline: true }
                )
                .setTimestamp();

            return safeReply(interaction, { embeds: [embed] });
        }

        if (subcommand === 'panel') {
            const config = await db.get(`tickets_${interaction.guild.id}`);
            if (!config) return safeReply(interaction, { content: '❌ Use `/ticket setup` first.', flags: [MessageFlags.Ephemeral] });

            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle('🎫 Support Tickets')
                .setDescription('Click the button below to create a support ticket.\nA private channel will be created for your issue.')
                .setFooter({ text: 'One open ticket at a time.' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return safeReply(interaction, { content: '✅ Ticket panel created!', flags: [MessageFlags.Ephemeral] });
        }

        if (subcommand === 'close') {
            if (!interaction.channel.name.startsWith('ticket-')) {
                return safeReply(interaction, { content: '❌ Use in ticket channels only.', flags: [MessageFlags.Ephemeral] });
            }

            const guildId = interaction.guild.id;
            const ticketConfig = await db.get(`tickets_${guildId}`);
            const existingTickets = await db.get(`opentickets_${guildId}`) || {};
            let ticketOwner = null;

            for (const [userId, channelId] of Object.entries(existingTickets)) {
                if (channelId === interaction.channel.id) { ticketOwner = userId; break; }
            }

            if (ticketConfig?.logChannel) {
                const logChannel = await interaction.guild.channels.fetch(ticketConfig.logChannel).catch(() => null);
                if (logChannel) {
                    const messages = await interaction.channel.messages.fetch({ limit: 100 });
                    const transcript = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[embed]'}`).join('\n');

                    const logEmbed = new EmbedBuilder()
                        .setColor('#ff4757')
                        .setTitle('🎫 Ticket Closed')
                        .addFields(
                            { name: 'Channel', value: interaction.channel.name, inline: true },
                            { name: 'Closed by', value: `${interaction.user}`, inline: true },
                            { name: 'Owner', value: ticketOwner ? `<@${ticketOwner}>` : 'Unknown', inline: true }
                        )
                        .setDescription(`\`\`\`\n${transcript.slice(0, 4000)}\n\`\`\``)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            }

            if (ticketOwner) {
                delete existingTickets[ticketOwner];
                await db.set(`opentickets_${guildId}`, existingTickets);
            }

            await safeReply(interaction, { content: '🔒 Closing ticket in 5 seconds...' });
            setTimeout(async () => {
                try { await interaction.channel.delete(); } catch { }
            }, 5000);
        }

        if (subcommand === 'add') {
            if (!interaction.channel.name.startsWith('ticket-')) {
                return safeReply(interaction, { content: '❌ Use in ticket channels only.', flags: [MessageFlags.Ephemeral] });
            }
            const user = interaction.options.getUser('user');
            try {
                await interaction.channel.permissionOverwrites.edit(user.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                });
                const embed = new EmbedBuilder()
                    .setColor('#00fbff')
                    .setDescription(`✅ ${user} added to ticket.`)
                    .setTimestamp();
                return safeReply(interaction, { embeds: [embed] });
            } catch (err) {
                return safeReply(interaction, { content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
            }
        }

        if (subcommand === 'remove') {
            if (!interaction.channel.name.startsWith('ticket-')) {
                return safeReply(interaction, { content: '❌ Use in ticket channels only.', flags: [MessageFlags.Ephemeral] });
            }
            const user = interaction.options.getUser('user');
            try {
                await interaction.channel.permissionOverwrites.delete(user.id);
                const embed = new EmbedBuilder()
                    .setColor('#ffa502')
                    .setDescription(`✅ ${user} removed from ticket.`)
                    .setTimestamp();
                return safeReply(interaction, { embeds: [embed] });
            } catch (err) {
                return safeReply(interaction, { content: `❌ Failed: ${err.message}`, flags: [MessageFlags.Ephemeral] });
            }
        }
    }
};
