const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { randomUUID } = require('crypto');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason').setRequired(true)),

    async execute(interaction, client, db) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const warnId = randomUUID().split('-')[0];
        const warning = { id: warnId, moderator: interaction.user.id, reason, timestamp: Date.now() };

        const key = `warnings_${interaction.guild.id}_${user.id}`;
        const warnings = await db.get(key) || [];
        warnings.push(warning);
        // Cap growth: this list is append-only and unbounded otherwise.
        await db.set(key, warnings.slice(-200));

        const embed = new EmbedBuilder()
            .setColor('#00fbff') // Neon Blue
            .setTitle('⚠️ User Warned')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderator', value: `${interaction.user}`, inline: true },
                { name: 'Reason', value: reason },
                { name: 'Warning ID', value: `\`${warnId}\``, inline: true },
                { name: 'Total Warnings', value: `${warnings.length}`, inline: true }
            )
            .setTimestamp();

        await safeReply(interaction, { embeds: [embed] });
    }
};
