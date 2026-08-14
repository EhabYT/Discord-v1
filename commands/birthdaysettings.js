const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthdaysettings')
        .setDescription('Configure birthday announcements (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('Show current birthday settings')
        )

        .addSubcommand(sub => sub
            .setName('channel')
            .setDescription('Set the channel for birthday announcements')
            .addChannelOption(opt =>
                opt.setName('channel').setDescription('Birthday announcement channel').setRequired(true)
            )
        )

        .addSubcommand(sub => sub
            .setName('role')
            .setDescription('Set a role to temporarily give members on their birthday')
            .addRoleOption(opt =>
                opt.setName('role').setDescription('Birthday role (given for 24 hours)').setRequired(true)
            )
        )

        .addSubcommand(sub => sub
            .setName('message')
            .setDescription('Customize the birthday message')
            .addStringOption(opt =>
                opt.setName('text')
                    .setDescription('Use {user} for mention, {name} for username. Leave blank to reset to default.')
                    .setRequired(false)
            )
        )

        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable birthday announcements')
        ),

    async execute(interaction, client, db) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const guildId = interaction.guild.id;
        const sub     = interaction.options.getSubcommand();
        const cfgKey  = `birthday_config_${guildId}`;

        if (sub === 'view') {
            const cfg = await db.get(cfgKey) || {};
            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('🎂 Birthday Settings')
                .addFields(
                    { name: 'Status',   value: cfg.disabled ? '❌ Disabled' : '✅ Enabled',                  inline: true },
                    { name: 'Channel',  value: cfg.channelId ? `<#${cfg.channelId}>` : 'Not set',              inline: true },
                    { name: 'Role',     value: cfg.roleId    ? `<@&${cfg.roleId}>`   : 'None (no temp role)',  inline: true },
                    { name: 'Message',  value: cfg.message   || '*(default)*',                                 inline: false },
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'channel') {
            const ch  = interaction.options.getChannel('channel');
            const cfg = await db.get(cfgKey) || {};
            cfg.channelId = ch.id;
            cfg.disabled  = false;
            await db.set(cfgKey, cfg);
            return interaction.editReply({ embeds: [ok(`Birthday announcements → ${ch}`)] });
        }

        if (sub === 'role') {
            const role = interaction.options.getRole('role');
            const cfg  = await db.get(cfgKey) || {};
            cfg.roleId = role.id;
            await db.set(cfgKey, cfg);
            return interaction.editReply({ embeds: [ok(`Birthday role set to ${role}. Members receive it for 24 hours on their birthday.`)] });
        }

        if (sub === 'message') {
            const text = interaction.options.getString('text') || null;
            const cfg  = await db.get(cfgKey) || {};
            cfg.message = text;
            await db.set(cfgKey, cfg);
            return interaction.editReply({
                embeds: [ok(text
                    ? `Birthday message set!\n\nPreview: "${text.replace('{user}', `@${interaction.user.username}`).replace('{name}', interaction.user.username)}"`
                    : 'Birthday message reset to default.'
                )]
            });
        }

        if (sub === 'disable') {
            const cfg = await db.get(cfgKey) || {};
            cfg.disabled = true;
            await db.set(cfgKey, cfg);
            return interaction.editReply({ embeds: [ok('Birthday announcements disabled.')] });
        }
    },
};

function ok(desc) {
    return new EmbedBuilder().setColor('#FF69B4').setDescription(`✅ ${desc}`).setTimestamp();
}
