const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { generateRankCard } = require('../../../shared/utils/rank-card');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('View your XP rank card or another member\'s')
        .addUserOption(opt =>
            opt.setName('user').setDescription('Member to check (defaults to you)')
        ),

    async execute(interaction, client, db) {
        const target = interaction.options.getUser('user') || interaction.user;
        await interaction.deferReply();

        try {
            const guildId = interaction.guild.id;

            // Fetch XP data
            const xpData = await db.get(`xp_${guildId}_${target.id}`) || { textXp: 0, textLevel: 1 };
            const level   = xpData.textLevel || 1;
            const xp      = xpData.textXp    || 0;
            const xpNeeded = level * 100;

            // Calculate rank: count members with higher (level * 100 + xp)
            const allKeys = await db.all().catch(() => []);
            const prefix  = `xp_${guildId}_`;
            const scores  = allKeys
                .filter(e => e.id.startsWith(prefix))
                .map(e => ({ userId: e.id.replace(prefix, ''), score: (e.value.textLevel || 1) * 100 + (e.value.textXp || 0) }));

            const myScore = level * 100 + xp;
            const rank    = scores.filter(s => s.score > myScore).length + 1;
            const totalUsers = scores.length || 1;

            // Fetch guild member for display name
            const member = await interaction.guild.members.fetch(target.id).catch(() => null);
            const displayName = member?.displayName || target.username;

            // Generate card
            const avatarURL = target.displayAvatarURL({ extension: 'png', size: 256 });
            const buffer = await generateRankCard({
                username:    target.username,
                displayName,
                avatarURL,
                level, xp, xpNeeded,
                rank, totalUsers,
            });

            const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
            await interaction.editReply({ files: [attachment] });

        } catch (err) {
            require('../../../shared/lib/logger').error('Rank card failed', { error: err.message });
            // Fallback embed if canvas fails
            const xpData   = await db.get(`xp_${interaction.guild.id}_${target.id}`) || { textXp: 0, textLevel: 1 };
            const level    = xpData.textLevel || 1;
            const xp       = xpData.textXp    || 0;
            const xpNeeded = level * 100;
            const pct      = xpNeeded > 0 ? Math.round((xp / xpNeeded) * 100) : 0;
            const bar      = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));

            const embed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle(`⚡ ${target.username}'s Rank`)
                .setThumbnail(target.displayAvatarURL({ size: 128 }))
                .addFields(
                    { name: 'Level', value: `**${level}**`, inline: true },
                    { name: 'XP',    value: `${xp} / ${xpNeeded}`, inline: true },
                    { name: 'Progress', value: `\`${bar}\` ${pct}%`, inline: false },
                )
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
