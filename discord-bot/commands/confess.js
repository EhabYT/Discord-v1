const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const COOLDOWN = 10 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Share an anonymous confession in this channel')
        .addStringOption(opt =>
            opt.setName('message').setDescription('Your anonymous confession').setRequired(true).setMaxLength(1500)
        ),
    defer: true,
    ephemeral: true,

    async execute(interaction, client, db) {
        const message = interaction.options.getString('message').trim();
        if (!message) {
            return interaction.editReply({
                content: 'Your confession cannot be empty.',
                flags: [MessageFlags.Ephemeral]
            });
        }
        const key = `confession_cooldown_${interaction.guild.id}_${interaction.user.id}`;
        const lastUsed = await db.get(key);
        const remaining = lastUsed ? COOLDOWN - (Date.now() - lastUsed) : 0;

        if (remaining > 0) {
            return interaction.editReply({
                content: `Please wait ${Math.ceil(remaining / 60000)} more minute(s) before confessing again.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('Anonymous Confession')
            .setDescription(message)
            .setFooter({ text: 'The author of this confession is not displayed.' })
            .setTimestamp();

        await interaction.channel.send({
            embeds: [embed],
            allowedMentions: { parse: [] }
        });
        await db.set(key, Date.now());

        return interaction.editReply({
            content: 'Your anonymous confession was shared in this channel.',
            flags: [MessageFlags.Ephemeral]
        });
    }
};