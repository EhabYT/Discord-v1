const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getCached, setCached } = require('../../../database/index');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levelsettings')
        .setDescription('Configure the XP leveling system (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        // ── /levelsettings view ───────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('Show all current leveling settings')
        )

        // ── /levelsettings announce ───────────────────────────────────────────
        .addSubcommandGroup(group => group
            .setName('announce')
            .setDescription('Level-up announcement settings')
            .addSubcommand(sub => sub
                .setName('channel')
                .setDescription('Set the channel where level-up messages are sent')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Announcement channel').setRequired(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('disable')
                .setDescription('Disable level-up announcements entirely')
            )
            .addSubcommand(sub => sub
                .setName('here')
                .setDescription('Send level-up announcements in the same channel as the message')
            )
        )

        // ── /levelsettings multiplier ─────────────────────────────────────────
        .addSubcommandGroup(group => group
            .setName('multiplier')
            .setDescription('XP multiplier settings')
            .addSubcommand(sub => sub
                .setName('global')
                .setDescription('Set the global XP multiplier for the whole server')
                .addNumberOption(opt =>
                    opt.setName('value').setDescription('Multiplier (0.1 – 10.0)').setRequired(true).setMinValue(0.1).setMaxValue(10)
                )
            )
            .addSubcommand(sub => sub
                .setName('role')
                .setDescription('Set an XP multiplier for a specific role')
                .addRoleOption(opt =>
                    opt.setName('role').setDescription('Target role').setRequired(true)
                )
                .addNumberOption(opt =>
                    opt.setName('value').setDescription('Multiplier (0.1 – 10.0, set to 1 to remove)').setRequired(true).setMinValue(0.1).setMaxValue(10)
                )
            )
        )

        // ── /levelsettings ignore ─────────────────────────────────────────────
        .addSubcommandGroup(group => group
            .setName('ignore')
            .setDescription('Channels where XP is not earned')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Stop earning XP in a channel')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Channel to ignore').setRequired(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Re-enable XP in a channel')
                .addChannelOption(opt =>
                    opt.setName('channel').setDescription('Channel to unignore').setRequired(true)
                )
            )
            .addSubcommand(sub => sub
                .setName('list')
                .setDescription('List all ignored channels')
            )
        ),

    async execute(interaction, client, db) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const guildId = interaction.guild.id;
        const sub     = interaction.options.getSubcommand();
        const group   = interaction.options.getSubcommandGroup(false);

        // ── VIEW ──────────────────────────────────────────────────────────────
        if (sub === 'view') {
            const [multiplier, ignoredChannels, announceCfg, roleMultipliers, rewards, xpEnabled] = await Promise.all([
                getCached(`xp_multiplier_${guildId}`),
                getCached(`xp_ignored_channels_${guildId}`),
                getCached(`levelup_announce_${guildId}`),
                getCached(`xp_role_multipliers_${guildId}`),
                getCached(`rewards_${guildId}`),
                getCached(`xp_enabled_${guildId}`),
            ]);

            let announceStr = '📢 Same channel as message';
            if (announceCfg === false) announceStr = '🔕 Disabled';
            else if (announceCfg?.channelId) announceStr = `<#${announceCfg.channelId}>`;

            const ignored   = (ignoredChannels || []).map(id => `<#${id}>`).join(', ') || 'None';
            const roleMults = (roleMultipliers || []).map(r => `<@&${r.roleId}> → **${r.value}×**`).join('\n') || 'None';
            const rewardList = (rewards || []).sort((a, b) => a.level - b.level)
                .map(r => `Level **${r.level}** → <@&${r.roleId}>`).join('\n') || 'None';

            const embed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('⚡ Leveling Settings')
                .addFields(
                    { name: '📊 XP System',         value: xpEnabled !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '✖️ Global Multiplier',  value: `**${multiplier || 1}×**`,                          inline: true },
                    { name: '📣 Announcements',      value: announceStr,                                         inline: true },
                    { name: '🔇 Ignored Channels',   value: ignored,                                             inline: false },
                    { name: '🎭 Role Multipliers',   value: roleMults,                                           inline: false },
                    { name: '🎁 Role Rewards',       value: rewardList,                                          inline: false },
                )
                .setFooter({ text: interaction.guild.name })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // ── ANNOUNCE ──────────────────────────────────────────────────────────
        if (group === 'announce') {
            if (sub === 'channel') {
                const ch = interaction.options.getChannel('channel');
                await setCached(`levelup_announce_${guildId}`, { channelId: ch.id });
                return interaction.editReply({ embeds: [ok(`Level-up announcements → ${ch}`)] });
            }
            if (sub === 'disable') {
                await setCached(`levelup_announce_${guildId}`, false);
                return interaction.editReply({ embeds: [ok('Level-up announcements **disabled**.')] });
            }
            if (sub === 'here') {
                await setCached(`levelup_announce_${guildId}`, null);
                return interaction.editReply({ embeds: [ok('Level-up announcements will post **in the same channel** as the message.')] });
            }
        }

        // ── MULTIPLIER ────────────────────────────────────────────────────────
        if (group === 'multiplier') {
            if (sub === 'global') {
                const value = interaction.options.getNumber('value');
                await setCached(`xp_multiplier_${guildId}`, value);
                return interaction.editReply({ embeds: [ok(`Global XP multiplier set to **${value}×**`)] });
            }
            if (sub === 'role') {
                const role  = interaction.options.getRole('role');
                const value = interaction.options.getNumber('value');
                let roleMults = await getCached(`xp_role_multipliers_${guildId}`) || [];
                roleMults = roleMults.filter(r => r.roleId !== role.id);
                if (value !== 1) roleMults.push({ roleId: role.id, value });
                await setCached(`xp_role_multipliers_${guildId}`, roleMults);
                const msg = value === 1
                    ? `Role multiplier for ${role} removed (back to 1×).`
                    : `Role multiplier for ${role} → **${value}×**`;
                return interaction.editReply({ embeds: [ok(msg)] });
            }
        }

        // ── IGNORE ────────────────────────────────────────────────────────────
        if (group === 'ignore') {
            let ignored = await getCached(`xp_ignored_channels_${guildId}`) || [];

            if (sub === 'add') {
                const ch = interaction.options.getChannel('channel');
                if (!ignored.includes(ch.id)) ignored.push(ch.id);
                await setCached(`xp_ignored_channels_${guildId}`, ignored);
                return interaction.editReply({ embeds: [ok(`${ch} added to ignored channels. No XP will be earned there.`)] });
            }
            if (sub === 'remove') {
                const ch = interaction.options.getChannel('channel');
                ignored = ignored.filter(id => id !== ch.id);
                await setCached(`xp_ignored_channels_${guildId}`, ignored);
                return interaction.editReply({ embeds: [ok(`${ch} removed from ignored channels. XP is earned there again.`)] });
            }
            if (sub === 'list') {
                const list = ignored.length ? ignored.map(id => `<#${id}>`).join('\n') : 'No channels are currently ignored.';
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#00FFFF').setTitle('🔇 Ignored Channels').setDescription(list).setTimestamp()]
                });
            }
        }
    },
};

function ok(desc) {
    return new EmbedBuilder().setColor('#00FFFF').setDescription(`✅ ${desc}`).setTimestamp();
}
