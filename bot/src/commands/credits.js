const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('credits')
        .setDescription('View or manage credits')
        .addUserOption(opt => opt.setName('user').setDescription('User'))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount (mod only)'))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason')),

    async execute(interaction, client, db) {
        const user = interaction.options.getUser('user') || interaction.user;
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason') || '';
        const key = `credits_${interaction.guild.id}_${user.id}`;

        if (amount !== null) {
            const { hasModPerms } = require('../../../shared/utils/discord');
            if (!hasModPerms(interaction.member)) {
                return safeReply(interaction, { content: '❌ Only moderators can manage credits.', flags: [MessageFlags.Ephemeral] });
            }

            const current = (await db.get(key)) || 0;
            const next = current + amount;
            await db.set(key, next);

            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle('💰 Credits Updated')
                .addFields(
                    { name: 'User', value: `${user}`, inline: true },
                    { name: 'Change', value: `${amount > 0 ? '+' : ''}${amount.toLocaleString()}`, inline: true },
                    { name: 'New Balance', value: `${next.toLocaleString()}`, inline: true }
                )
                .setTimestamp();

            if (reason) embed.addFields({ name: 'Reason', value: reason });

            return safeReply(interaction, { embeds: [embed] });
        }

        const credits = (await db.get(key)) || 0;
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle(`💰 Credits | ${user.username}`)
            .setDescription(`**${credits.toLocaleString()}** credits available in this server.`)
            .setThumbnail(user.displayAvatarURL({ size: 128 }))
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] });
    }
};
