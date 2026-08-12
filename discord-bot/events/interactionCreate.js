const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils_logger');
const { safeReply } = require('../utils/helpers');
const { handleTicketCreate, handleTicketClose } = require('../utils/tickets');
const { handleMusicButton, handleMusicFilterSelect } = require('../utils/music_interactions');
const { handleHelpSelect } = require('../utils/help_interactions');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const db = client.db;

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

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
            try { require('../utils/analytics').trackCommand(interaction.guildId, interaction.commandName); } catch(e) {}
            try {
                await command.execute(interaction, client, db);
            } catch (err) {
                logger.error(`Command error: /${interaction.commandName}`, { error: err.message, stack: err.stack });
                const EmbedHelper = require('../utils/embedHelper');
                const embed = EmbedHelper.error(`There was an error while executing this command!\n\`\`\`${err.message}\`\`\``, client);
                await safeReply(interaction, {
                    embeds: [embed],
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
        else if (interaction.isButton()) {
            if (interaction.customId === 'create_ticket') await handleTicketCreate(interaction, client, db);
            else if (interaction.customId === 'close_ticket') await handleTicketClose(interaction, db);
            else if (interaction.customId === 'verification_entry') {
                const config = await db.get(`verification_${interaction.guildId}`);
                if (config && config.roleId) {
                    const role = interaction.guild.roles.cache.get(config.roleId);
                    if (role) {
                        try {
                            await interaction.member.roles.add(role);
                            await interaction.reply({ content: '✅ You have been verified!', flags: [MessageFlags.Ephemeral] });
                        } catch (err) {
                            console.error(err);
                            await interaction.reply({ content: '❌ Failed to assign role. Please contact an administrator.', flags: [MessageFlags.Ephemeral] });
                        }
                    } else {
                        await interaction.reply({ content: '❌ Verification role not found. Please contact an administrator.', flags: [MessageFlags.Ephemeral] });
                    }
                } else {
                    await interaction.reply({ content: '❌ Verification system not set up.', flags: [MessageFlags.Ephemeral] });
                }
            }
            else if (interaction.customId.startsWith('music_')) await handleMusicButton(interaction, client.player, db);
        }
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'music_filters') await handleMusicFilterSelect(interaction, client.player, db);
            else if (interaction.customId === 'help_category') await handleHelpSelect(interaction);
        }
    }
};
