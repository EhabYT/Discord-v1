const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const confessions = require('../../../shared/services/confessions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Share an anonymous confession')
        .addStringOption(opt =>
            opt.setName('message').setDescription('Your anonymous confession').setRequired(true).setMaxLength(1500)
        ),
    defer: true,
    ephemeral: true,

    async execute(interaction, client, db) {
        const cfg = await confessions.getConfig(db, interaction.guild.id);
        try {
            await confessions.create(interaction.guild, db, {
                message: interaction.options.getString('message'),
                channelId: cfg.channelId || interaction.channel.id,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
            });
            return interaction.editReply({
                content: 'Your anonymous confession was shared.',
                flags: [MessageFlags.Ephemeral],
            });
        } catch (err) {
            return interaction.editReply({
                content: err.message || 'Could not post confession.',
                flags: [MessageFlags.Ephemeral],
            });
        }
    },
};
