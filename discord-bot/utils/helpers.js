const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const logger = require('../utils_logger');
const { getCached } = require('./db_wrapper');

const DURATIONS = {
    'm': 60000,
    'h': 3600000,
    'd': 86400000,
    'w': 604800000,
    'mo': 2592000000
};

/**
 * Checks if a member has moderator permissions.
 * @param {import('discord.js').GuildMember} member 
 * @returns {boolean}
 */
function hasModPerms(member) {
    if (!member) return false;
    return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages) ||
        member.permissions.has(PermissionFlagsBits.ModerateMembers)
    );
}

/**
 * Parses a time string (e.g., '1h', '30m') into milliseconds.
 * @param {string} timeStr 
 * @returns {number|null}
 */
function parseTimeString(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d+)(m|h|d|w|mo)$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return value * (DURATIONS[unit] || 0);
}

/**
 * Formats milliseconds into a human-readable duration string.
 * @param {number} ms 
 * @returns {string}
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Safely replies to an interaction, handling deferred or already replied states.
 * Automatically converts deprecated 'ephemeral' option to 'flags'.
 * @param {import('discord.js').Interaction} i 
 * @param {object} options 
 */
async function safeReply(i, options) {
    try {
        if (options.ephemeral) {
            options.flags = [MessageFlags.Ephemeral];
            delete options.ephemeral;
        }

        if (i.deferred || i.replied) return await i.editReply(options);
        return await i.reply(options);
    } catch (err) {
        logger.error('SafeReply failed', { error: err.message });
    }
}

/**
 * Validates a hex color string.
 * @param {string} color 
 * @returns {string|null}
 */
function validateHexColor(color) {
    if (!color) return null;
    const hex = color.startsWith('#') ? color : '#' + color;
    return (/^#[A-Fa-f0-9]{6}$/).test(hex) ? hex : null;
}

/**
 * Safely fetches a member from a guild.
 * @param {import('discord.js').Guild} guild 
 * @param {string} userId 
 * @returns {Promise<import('discord.js').GuildMember|null>}
 */
async function fetchMemberSafe(guild, userId) {
    try {
        return await guild.members.fetch(userId);
    } catch {
        return null;
    }
}

/**
 * Checks if a user has DJ permissions in a guild.
 * @param {import('discord.js').Interaction} i 
 * @param {any} db 
 * @returns {Promise<boolean>}
 */
async function checkDJPerms(i, db) {
    const djRoleId = await getCached(`djrole_${i.guild.id}`);
    if (!djRoleId) return true;
    if (hasModPerms(i.member)) return true;
    if (i.member.roles.cache.has(djRoleId)) return true;

    const voiceChannel = i.member.voice.channel;
    if (voiceChannel && voiceChannel.members.filter(m => !m.user.bot).size <= 1) return true;

    return false;
}

/**
 * Creates a standardized professional embed.
 * (Deprecated: Use EmbedHelper.create directly for new code)
 */
function createRichEmbed(title, description, type, client) {
    const EmbedHelper = require('./embedHelper');
    return EmbedHelper.create({ title, description, type, client });
}

module.exports = {
    hasModPerms,
    parseTimeString,
    formatDuration,
    safeReply,
    validateHexColor,
    fetchMemberSafe,
    checkDJPerms,
    createRichEmbed
};
