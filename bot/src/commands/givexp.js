const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getCached, setCached } = require('../../../database/index');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givexp')
        .setDescription('Give or remove XP from a member (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt =>
            opt.setName('user').setDescription('Target member').setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('amount').setDescription('XP to give (use negative to remove)').setRequired(true)
        ),

    async execute(interaction, client, db) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const target  = interaction.options.getUser('user');
        const amount  = interaction.options.getInteger('amount');
        const guildId = interaction.guild.id;

        const xK  = `xp_${guildId}_${target.id}`;
        let xD    = await getCached(xK) || { textXp: 0, textLevel: 1, voiceXp: 0, voiceLevel: 1 };
        const oldLevel = xD.textLevel;

        xD.textXp = Math.max(0, (xD.textXp || 0) + amount);

        // Process level-ups
        const levelsGained = [];
        while (xD.textXp >= xD.textLevel * 100) {
            xD.textXp -= xD.textLevel * 100;
            xD.textLevel++;
            levelsGained.push(xD.textLevel);
        }

        // Process level-downs (negative XP)
        while (xD.textLevel > 1 && xD.textXp < 0) {
            xD.textLevel--;
            xD.textXp += xD.textLevel * 100;
        }
        if (xD.textXp < 0) xD.textXp = 0;

        await setCached(xK, xD);

        // Apply role rewards for any new levels reached
        const rolesAdded = [];
        if (levelsGained.length > 0) {
            const rewards = await getCached(`rewards_${guildId}`) || [];
            const member  = await interaction.guild.members.fetch(target.id).catch(() => null);
            if (member) {
                for (const lvl of levelsGained) {
                    const reward = rewards.find(r => r.level === lvl);
                    if (reward) {
                        const role = interaction.guild.roles.cache.get(reward.roleId);
                        if (role && !member.roles.cache.has(reward.roleId)) {
                            await member.roles.add(role).catch(() => {});
                            rolesAdded.push(`Level ${lvl}: ${role.name}`);
                        }
                    }
                }
            }
        }

        const sign     = amount >= 0 ? '+' : '';
        const xpNeeded = xD.textLevel * 100;
        const pct      = Math.round((xD.textXp / xpNeeded) * 100);
        const barFill  = Math.floor(pct / 10);
        const bar      = '█'.repeat(barFill) + '░'.repeat(10 - barFill);

        const embed = new EmbedBuilder()
            .setColor(amount >= 0 ? '#00FFFF' : '#FF6B6B')
            .setTitle(`${amount >= 0 ? '⬆️' : '⬇️'} XP ${amount >= 0 ? 'Granted' : 'Removed'}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: 'Member',   value: `${target}`,                       inline: true },
                { name: 'Change',   value: `**${sign}${amount} XP**`,         inline: true },
                { name: 'Level',    value: `${oldLevel} → **${xD.textLevel}**`, inline: true },
                { name: 'Progress', value: `\`${bar}\` ${pct}%  (${xD.textXp}/${xpNeeded} XP)` },
            );

        if (rolesAdded.length > 0) {
            embed.addFields({ name: '🎁 Roles Granted', value: rolesAdded.map(r => `• ${r}`).join('\n') });
        }

        embed.setFooter({ text: `Adjusted by ${interaction.user.tag}` }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
