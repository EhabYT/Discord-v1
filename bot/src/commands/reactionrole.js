const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage reaction roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Set up a reaction role')
                .addStringOption(opt => opt.setName('message_id').setDescription('Message ID').setRequired(true))
                .addStringOption(opt => opt.setName('emoji').setDescription('Emoji').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true))
                .addStringOption(opt => opt.setName('mode').setDescription('Mode')
                    .addChoices(
                        { name: 'Toggle', value: 'toggle' },
                        { name: 'Add only', value: 'add' },
                        { name: 'Remove only', value: 'remove' }
                    ))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a reaction role')
                .addStringOption(opt => opt.setName('message_id').setDescription('Message ID').setRequired(true))
                .addStringOption(opt => opt.setName('emoji').setDescription('Emoji').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all reaction roles')
        ),

    async execute(interaction, client, db) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const messageId = interaction.options.getString('message_id');
            const emoji = interaction.options.getString('emoji');
            const role = interaction.options.getRole('role');
            const mode = interaction.options.getString('mode') || 'toggle';

            const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (!message) return interaction.reply({ content: '❌ Message not found.', flags: [MessageFlags.Ephemeral] });

            try {
                await message.react(emoji);
            } catch {
                return interaction.reply({ content: '❌ Invalid emoji.', flags: [MessageFlags.Ephemeral] });
            }

            const key = `reactionroles_${interaction.guild.id}`;
            const rr = await db.get(key) || [];
            const filtered = rr.filter(r => !(r.messageId === messageId && r.emoji === emoji));

            filtered.push({ messageId, channelId: interaction.channel.id, emoji, roleId: role.id, mode });
            await db.set(key, filtered);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Reaction Role Created')
                .addFields(
                    { name: 'Emoji', value: emoji, inline: true },
                    { name: 'Role', value: `${role}`, inline: true },
                    { name: 'Mode', value: mode, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'remove') {
            const messageId = interaction.options.getString('message_id');
            const emoji = interaction.options.getString('emoji');
            const key = `reactionroles_${interaction.guild.id}`;

            const rr = await db.get(key) || [];
            const filtered = rr.filter(r => !(r.messageId === messageId && r.emoji === emoji));

            if (filtered.length === rr.length) return interaction.reply({ content: '❌ Not found.', flags: [MessageFlags.Ephemeral] });

            await db.set(key, filtered);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('✅ Reaction Role Removed')
                .setDescription(`Removed for ${emoji} on \`${messageId}\``)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'list') {
            const rr = await db.get(`reactionroles_${interaction.guild.id}`) || [];

            if (rr.length === 0) return interaction.reply({ content: '❌ No reaction roles.', flags: [MessageFlags.Ephemeral] });

            const desc = rr.map((r, i) => `**${i + 1}.** ${r.emoji} → <@&${r.roleId}> (${r.mode})\nMsg: \`${r.messageId}\` in <#${r.channelId}>`).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎭 Reaction Roles')
                .setDescription(desc)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
};
