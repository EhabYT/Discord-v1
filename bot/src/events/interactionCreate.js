const { Events, MessageFlags } = require('discord.js');
const logger = require('../../../shared/lib/logger');
const { safeReply } = require('../../../shared/utils/discord');
const { handleTicketCreate, handleTicketClose } = require('../../../shared/services/tickets');
const { handleMusicButton, handleMusicFilterSelect } = require('../../../shared/utils/music-interactions');
const { handleHelpSelect } = require('../../../shared/utils/help-interactions');
const { handleGameButton } = require('../../../shared/utils/game-interactions');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const db = client.db;

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            if (!interaction.inGuild()) {
                return interaction.reply({
                    content: '❌ This command only works in a server.',
                    flags: [MessageFlags.Ephemeral]
                }).catch(() => {});
            }

            try {
                const flags = await db.get('dev_flags') || {};
                if (flags.maintenance) {
                    const owner = process.env.OWNER_ID;
                    if (!owner || interaction.user.id !== owner) {
                        return interaction.reply({
                            content: '🛠️ EB is in **maintenance mode**. Try again in a minute.',
                            flags: [MessageFlags.Ephemeral]
                        }).catch(() => {});
                    }
                }
            } catch { /* ignore flag read */ }

            // Check if command is disabled via dashboard
            const enabledMap = await db.get(`commands_enabled_${interaction.guildId}`) || {};
            if (enabledMap[interaction.commandName] === false) {
                return interaction.reply({
                    content: '🚫 This command has been disabled by a server administrator via the dashboard.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // Defer immediately if the command is marked as requiring it, or if it's a known slow type
            if (command.defer) {
                await interaction.deferReply({ flags: (command.ephemeral ? [MessageFlags.Ephemeral] : []) }).catch(() => { });
            }

            logger.command(interaction.commandName, interaction.user, interaction.guild);
            try { require('../../../shared/services/analytics').trackCommand(interaction.guildId, interaction.commandName); } catch(e) {}
            try {
                await command.execute(interaction, client, db);
            } catch (err) {
                logger.error(`Command error: /${interaction.commandName}`, { error: err.message, stack: err.stack });
                const EmbedHelper = require('../../../shared/utils/embed');
                const embed = EmbedHelper.error(`There was an error while executing this command!\n\`\`\`${err.message}\`\`\``, client);
                await safeReply(interaction, {
                    embeds: [embed],
                    flags: [MessageFlags.Ephemeral]
                });
            }
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
                const { isTicketStaff } = require('../../../shared/services/tickets');
                if (!(await isTicketStaff(interaction, db))) {
                    return interaction.reply({ content: '❌ Only support staff can claim tickets.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
                }
                await db.set(`ticketclaim_${interaction.guildId}_${interaction.channelId}`, { userId: interaction.user.id, at: Date.now() });
                await interaction.channel.setTopic(`Claimed by ${interaction.user.tag}`).catch(() => {});
                await interaction.reply({ embeds: [{ color: 0x00fbff, description: `🎟️ ${interaction.user} claimed this ticket.` }] }).catch(() => {});
            }
            else if (interaction.customId === 'verification_entry') {
                const { handleVerifyClick } = require('../../../shared/services/verification');
                await handleVerifyClick(interaction, db);
            }
            else if (interaction.customId.startsWith('verify_cap_')) {
                const { handleCaptchaClick } = require('../../../shared/services/verification');
                await handleCaptchaClick(interaction, db);
            }
            else if (interaction.customId.startsWith('rr_btn_')) {
                const { handleButton } = require('../../../shared/services/reaction-roles');
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
