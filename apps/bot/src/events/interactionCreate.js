const { Events, MessageFlags } = require('discord.js');
const { handleTicketCreate, handleTicketClose } = require('eb-bot-shared/services/tickets');
const { handleMusicButton, handleMusicFilterSelect } = require('eb-bot-shared/utils/music-interactions');
const { handleHelpSelect } = require('eb-bot-shared/utils/help-interactions');
const { handleGameButton } = require('eb-bot-shared/utils/game-interactions');
const { guard } = require('../guards/command-guard');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const db = client.db;

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // Wrap command with security guard
            const guardedExecute = guard(command.execute.bind(command), {
                rateLimit: true,
                validateGuild: true,
            });

            // Defer immediately if the command is marked as requiring it, or if it's a known slow type
            if (command.defer) {
                await interaction.deferReply({ flags: (command.ephemeral ? [MessageFlags.Ephemeral] : []) }).catch(() => { });
            }

            await guardedExecute(interaction, client, db);
        }
        else if (interaction.isButton()) {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: '❌ This only works in a server.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
            if (interaction.customId === 'create_ticket' || interaction.customId === 'ticket_open') await handleTicketCreate(interaction, client, db);
            else if (interaction.customId === 'close_ticket') await handleTicketClose(interaction, db);
            else if (interaction.customId === 'claim_ticket') {
                // Only support staff may claim. Previously any member who could see
                // the channel — including the ticket opener — could mark themselves
                // as the handling staff member and rewrite the channel topic.
                const { isTicketStaff } = require('eb-bot-shared/services/tickets');
                if (!(await isTicketStaff(interaction, db))) {
                    return interaction.reply({ content: '❌ Only support staff can claim tickets.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                }
                await db.set(`ticketclaim_${interaction.guildId}_${interaction.channelId}`, { userId: interaction.user.id, at: Date.now() });
                await interaction.channel.setTopic(`Claimed by ${interaction.user.tag}`).catch(() => {});
                await interaction.reply({ embeds: [{ color: 0x00fbff, description: `🎟️ ${interaction.user} claimed this ticket.` }] }).catch(() => {});
            }
            else if (interaction.customId === 'verification_entry') {
                const { handleVerifyClick } = require('eb-bot-shared/services/verification');
                await handleVerifyClick(interaction, db);
            }
            else if (interaction.customId.startsWith('verify_cap_')) {
                const { handleCaptchaClick } = require('eb-bot-shared/services/verification');
                await handleCaptchaClick(interaction, db);
            }
            else if (interaction.customId.startsWith('rr_btn_')) {
                const { handleButton } = require('eb-bot-shared/services/reaction-roles');
                await handleButton(interaction, db);
            }
            else if (interaction.customId.startsWith('music_')) await handleMusicButton(interaction, client.player, db);
            else if (interaction.customId.startsWith('game_')) await handleGameButton(interaction);
        }
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'music_filters') {
                if (!interaction.inGuild()) {
                    return interaction.reply({ content: '❌ This only works in a server.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                }
                await handleMusicFilterSelect(interaction, client.player, db);
            }
            else if (interaction.customId === 'help_category') await handleHelpSelect(interaction);
        }
    }
};
