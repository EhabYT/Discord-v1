/**
 * Input Sanitization Utilities
 *
 * Provides functions to sanitize user input for safe display in Discord
 * messages and embeds. Prevents XSS, injection, and formatting abuse.
 */

/**

/**
 * Characters that can be used for markdown/formatting injection
 */
const DANGEROUS_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Discord-specific formatting characters that can be abused
 */
const DISCORD_FORMATTING = /[*_~`>|\\]/g;

/**
 * Sanitize a string for safe display in Discord messages.
 * Removes dangerous characters and limits length.
 *
 * @param {string} input - Raw user input
 * @param {Object} options - Sanitization options
 * @param {number} [options.maxLength=2000] - Maximum string length
 * @param {boolean} [options.preserveFormatting=false] - Keep markdown chars
 * @param {boolean} [options.stripControlChars=true] - Remove control chars
 * @returns {string} Sanitized string
 */
function sanitizeString(input, options = {}) {
    if (typeof input !== 'string') return '';

    const {
        maxLength = 2000,
        preserveFormatting = false,
        stripControlChars = true,
    } = options;

    let result = input;

    if (stripControlChars) {
        result = result.replace(DANGEROUS_CHARS, '');
    }

    if (!preserveFormatting) {
        result = result.replace(DISCORD_FORMATTING, '');
    }

    result = result.trim();

    if (result.length > maxLength) {
        result = result.slice(0, maxLength);
    }

    return result;
}

/**
 * Sanitize a string to prevent injection in code blocks or commands.
 *
 * @param {string} input - Raw user input
 * @param {number} [maxLength=100] - Maximum string length
 * @returns {string} Sanitized string safe for code contexts
 */
function sanitizeCode(input, maxLength = 100) {
    if (typeof input !== 'string') return '';

    let result = input
        .replace(/`/g, '')
        .replace(/\$/g, '')
        .replace(/\{/g, '')
        .replace(/\}/g, '')
        .replace(DANGEROUS_CHARS, '')
        .trim();

    if (result.length > maxLength) {
        result = result.slice(0, maxLength);
    }

    return result;
}

/**
 * Sanitize a username or nickname for safe display.
 *
 * @param {string} input - Raw username
 * @param {number} [maxLength=32] - Discord username max length
 * @returns {string} Sanitized username
 */
function sanitizeUsername(input, maxLength = 32) {
    if (typeof input !== 'string') return '';

    let result = input
        .replace(/@/g, '')
        .replace(/#/g, '')
        .replace(/everyone/gi, '')
        .replace(/here/gi, '')
        .replace(DANGEROUS_CHARS, '')
        .trim();

    if (result.length > maxLength) {
        result = result.slice(0, maxLength);
    }

    return result;
}

/**
 * Sanitize a reason string for moderation actions.
 * Discord audit log reasons have a 512 char limit.
 *
 * @param {string} input - Raw reason
 * @param {number} [maxLength=512] - Audit log limit
 * @returns {string} Sanitized reason
 */
function sanitizeReason(input, maxLength = 512) {
    if (typeof input !== 'string') return '';

    let result = input
        .replace(DANGEROUS_CHARS, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (result.length > maxLength) {
        result = result.slice(0, maxLength);
    }

    return result;
}

/**
 * Sanitize a URL to prevent injection attacks.
 *
 * @param {string} input - Raw URL
 * @returns {string|null} Sanitized URL or null if invalid
 */
function sanitizeUrl(input) {
    if (typeof input !== 'string') return null;

    const trimmed = input.trim();

    try {
        const url = new URL(trimmed);
        if (!['http:', 'https:'].includes(url.protocol)) {
            return null;
        }
        return url.href;
    } catch {
        return null;
    }
}

/**
 * Sanitize an embed field value (max 1024 chars).
 *
 * @param {string} input - Raw field value
 * @param {number} [maxLength=1024] - Discord embed field limit
 * @returns {string} Sanitized field value
 */
function sanitizeFieldValue(input, maxLength = 1024) {
    return sanitizeString(input, { maxLength, preserveFormatting: true });
}

/**
 * Escape markdown characters for safe display.
 *
 * @param {string} input - Raw text
 * @returns {string} Escaped text
 */
function escapeMarkdown(input) {
    if (typeof input !== 'string') return '';

    return input
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/\|/g, '\\|');
}

/**
 * Sanitize input for use in Discord slash command options.
 *
 * @param {string} input - Raw command input
 * @param {Object} options - Options
 * @param {number} [options.maxLength=100] - Command option max length
 * @returns {string} Sanitized input
 */
function sanitizeCommandInput(input, options = {}) {
    const { maxLength = 100 } = options;

    if (typeof input !== 'string') return '';

    let result = input
        .replace(DANGEROUS_CHARS, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (result.length > maxLength) {
        result = result.slice(0, maxLength);
    }

    return result;
}

module.exports = {
    sanitizeString,
    sanitizeCode,
    sanitizeUsername,
    sanitizeReason,
    sanitizeUrl,
    sanitizeFieldValue,
    escapeMarkdown,
    sanitizeCommandInput,
    DANGEROUS_CHARS,
    DISCORD_FORMATTING,
};
