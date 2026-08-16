const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { setCached } = require('../../../database/index');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetxp')
        .setDescription('Reset a member\'s XP and level to zero (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt =>
            opt.setName('user').setDescription('Member to reset').setRequired(true)
        ),

    async execute(interaction, client, db) {
        const target = interaction.options.getUser('user');

        const confirm = new ButtonBuilder()
            .setCustomId('resetxp_confirm')
            .setLabel('Yes, Reset')
            .setStyle(ButtonStyle.Danger);

        const cancel = new ButtonBuilder()
            .setCustomId('resetxp_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirm, cancel);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('⚠️ Confirm XP Reset')
                    .setDescription(`This will permanently reset **${target.tag}**'s XP and level back to Level 1 / 0 XP.

This cannot be undone.`)
                    .setTimestamp()
            ],
            components: [row],
            flags: [MessageFlags.Ephemeral],
        });
        const prompt = await interaction.fetchReply();

        const collector = prompt.createMessageComponentCollector({ time: 15000 });

        collector.on('collect', async btn => {
            if (btn.user.id !== interaction.user.id) {
                return btn.reply({ content: 'Only the command user can confirm this.', flags: [MessageFlags.Ephemeral] });
            }

            if (btn.customId === 'resetxp_confirm') {
                const xK = `xp_${interaction.guild.id}_${target.id}`;
                await setCached(xK, { textXp: 0, textLevel: 1, voiceXp: 0, voiceLevel: 1 });

                await btn.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#00FFFF')
                            .setTitle('✅ XP Reset')
                            .setDescription(`**${target.tag}**'s XP has been reset to Level 1 / 0 XP.`)
                            .setFooter({ text: `Reset by ${interaction.user.tag}` })
                            .setTimestamp()
                    ],
                    components: [],
                });
            } else {
                await btn.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#6b7280')
                            .setDescription('Reset cancelled.')
                            .setTimestamp()
                    ],
                    components: [],
                });
            }
            collector.stop();
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time') {
                await interaction.editReply({ components: [] }).catch(() => {});
            }
        });
    },
};
