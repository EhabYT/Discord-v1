const { EmbedBuilder } = require('discord.js');
const config = require('../../config/bot.json');

/**
 * Standardized Embed Utility for EB Bot "Elite" Branding
 */
class EmbedHelper {
    /**
     * Create a premium standardized embed
     * @param {Object} options Options for the embed
     * @param {string} options.title Title of the embed
     * @param {string} options.description Content of the embed
     * @param {string} [options.type='info'] info, success, warning, error, primary
     * @param {Object} [options.client] Bot client for brand footer info
     * @param {Object} [options.user] Optional author to set
     */
    static create({ title, description, type = 'info', client, user, footerText }) {
        const colorMap = {
            primary: config.colors.primary,
            success: config.colors.success,
            warning: config.colors.warning,
            error: config.colors.error,
            info: config.colors.info
        };

        const embed = new EmbedBuilder()
            .setColor(colorMap[type] || config.colors.primary)
            .setTimestamp();

        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);

        if (user) {
            embed.setAuthor({
                name: user.tag,
                iconURL: user.displayAvatarURL({ dynamic: true })
            });
        }

        const footer = footerText || (client ? `${client.user.username} Elite Oversight` : 'EB Bot Premium');
        embed.setFooter({
            text: footer,
            iconURL: client ? client.user.displayAvatarURL() : null
        });

        return embed;
    }

    /**
     * Shortcut for error embeds
     */
    static error(description, client) {
        return this.create({ title: '❌ Error Encountered', description, type: 'error', client });
    }
}

module.exports = EmbedHelper;
