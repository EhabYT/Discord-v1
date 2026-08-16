const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getCached, setCached } = require('../../../database/index');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlevel')
        .setDescription('Set a member\'s level directly (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt =>
            opt.setName('user').setDescription('Member to adjust').setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('level').setDescription('Target level (1–500)').setRequired(true).setMinValue(1).setMaxValue(500)
        ),

    async execute(interaction, client, db) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const target  = interaction.options.getUser('user');
        const newLevel = interaction.options.getInteger('level');
        const guildId  = interaction.guild.id;

        const xK   = `xp_${guildId}_${target.id}`;
        const prev = await getCached(xK) || { textXp: 0, textLevel: 1, voiceXp: 0, voiceLevel: 1 };
        const oldLevel = prev.textLevel;

        // Set level; reset XP to 0 within the new level
        prev.textLevel = newLevel;
        prev.textXp    = 0;
        await setCached(xK, prev);

        // Apply ALL role rewards up to newLevel
        const rewards = await getCached(`rewards_${guildId}`) || [];
        const member  = await interaction.guild.members.fetch(target.id).catch(() => null);
        const rolesAdded = [];
        if (member) {
            for (const r of rewards) {
                if (r.level <= newLevel) {
                    const role = interaction.guild.roles.cache.get(r.roleId);
                    if (role && !member.roles.cache.has(r.roleId)) {
                        await member.roles.add(role).catch(() => {});
                        rolesAdded.push(role.name);
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle('⚡ Level Updated')
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: 'Member',    value: `${target}`,       inline: true },
                { name: 'Old Level', value: `**${oldLevel}**`, inline: true },
                { name: 'New Level', value: `**${newLevel}**`, inline: true },
            );

        if (rolesAdded.length > 0) {
            embed.addFields({ name: '🎁 Roles Granted', value: rolesAdded.map(n => `• ${n}`).join('\n') });
        }

        embed.setFooter({ text: `Set by ${interaction.user.tag}` }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });

        // Notify the user in the channel if possible
        try {
            const notifyEmbed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setDescription(`⚡ ${target} — your level was manually set to **Level ${newLevel}** by a moderator.`)
                .setTimestamp();
            const msg = await interaction.channel.send({ embeds: [notifyEmbed] });
            setTimeout(() => msg.delete().catch(() => {}), 20000);
        } catch (_) {}
    },
};
