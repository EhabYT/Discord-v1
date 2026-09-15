/**
 * Discord Bot Command Guard — Input Validation & Anti-Abuse.
 *
 * Implements the security layer between Discord and the bot:
 *   - Permission checks (Discord native permissions)
 *   - Role hierarchy validation
 *   - Input validation and sanitization
 *   - Anti-abuse / Rate limiting per user/guild
 *   - No trust in client-provided guild/user IDs
 *
 * SECURITY MODEL — defense in depth:
 *   1. Discord validates the interaction structure
 *   2. This guard validates permissions and inputs
 *   3. The command handler performs the action
 *   4. Results are validated before reply
 */

const logger = require('eb-bot-shared/lib/logger');

// Rate limiting state
const userRateLimits = new Map();
const guildRateLimits = new Map();
const commandRateLimits = new Map(); // Per-command rate limits
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const USER_RATE_LIMIT = 30; // commands per minute per user
const GUILD_RATE_LIMIT = 100; // commands per minute per guild

// Per-command rate limits for privileged/risky commands
const COMMAND_RATE_LIMITS = {
    ban: { max: 5, windowMs: 60000 }, // 5 bans per minute
    kick: { max: 10, windowMs: 60000 }, // 10 kicks per minute
    timeout: { max: 10, windowMs: 60000 },
    warn: { max: 20, windowMs: 60000 },
    clear: { max: 5, windowMs: 60000 },
    softban: { max: 5, windowMs: 60000 },
    lockdown: { max: 3, windowMs: 60000 },
    role: { max: 10, windowMs: 60000 },
};

// Input limits
const MAX_STRING_LENGTH = 2000;
const MAX_REASON_LENGTH = 512;
const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_FIELD_VALUE = 1024;

// Sweep stale rate limit entries
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of userRateLimits.entries()) {
        if (now > entry.resetAt + 60_000) userRateLimits.delete(key);
    }
    for (const [key, entry] of guildRateLimits.entries()) {
        if (now > entry.resetAt + 60_000) guildRateLimits.delete(key);
    }
}, 5 * 60 * 1000);
if (typeof sweeper.unref === 'function') sweeper.unref();

/**
 * Check if a user is rate limited.
 * @returns {null|string} null if allowed, error message if denied
 */
function checkUserRateLimit(userId) {
    const now = Date.now();
    let entry = userRateLimits.get(userId);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
        userRateLimits.set(userId, entry);
    }

    entry.count++;
    if (entry.count > USER_RATE_LIMIT) {
        return 'You are using commands too quickly. Please wait a moment.';
    }
    return null;
}

/**
 * Check if a guild is rate limited.
 * @returns {null|string} null if allowed, error message if denied
 */
function checkGuildRateLimit(guildId) {
    const now = Date.now();
    let entry = guildRateLimits.get(guildId);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
        guildRateLimits.set(guildId, entry);
    }

    entry.count++;
    if (entry.count > GUILD_RATE_LIMIT) {
        return 'This server is using too many commands. Please wait a moment.';
    }
    return null;
}

/**
 * Check if a specific command is rate limited.
 * @param {string} commandName - The command name
 * @param {string} userId - The user ID
 * @returns {null|string} null if allowed, error message if denied
 */
function checkCommandRateLimit(commandName, userId) {
    const limit = COMMAND_RATE_LIMITS[commandName];
    if (!limit) return null; // No per-command limit configured

    const now = Date.now();
    const key = `${commandName}:${userId}`;
    let entry = commandRateLimits.get(key);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + limit.windowMs };
        commandRateLimits.set(key, entry);
    }

    entry.count++;
    if (entry.count > limit.max) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return `You are using /${commandName} too quickly. Please wait ${retryAfter} seconds.`;
    }
    return null;
}

/**
 * Validate that a string input is safe.
 * @param {string} input - The input to validate
 * @param {Object} options - Validation options
 * @returns {{ valid: boolean, error?: string, sanitized?: string }}
 */
function validateStringInput(input, options = {}) {
    const {
        max = MAX_STRING_LENGTH,
        min = 0,
        allowEmpty = false,
        pattern = null,
        name = 'input',
    } = options;

    if (typeof input !== 'string') {
        return { valid: false, error: `${name} must be text` };
    }

    // Sanitize: trim and remove null bytes
    const sanitized = input.trim().replace(/\0/g, '');

    if (!allowEmpty && sanitized.length === 0) {
        return { valid: false, error: `${name} cannot be empty` };
    }

    if (sanitized.length < min) {
        return { valid: false, error: `${name} must be at least ${min} characters` };
    }

    if (sanitized.length > max) {
        return { valid: false, error: `${name} must be ${max} characters or fewer` };
    }

    if (pattern && !pattern.test(sanitized)) {
        return { valid: false, error: `${name} has an invalid format` };
    }

    // Block common injection patterns
    if (sanitized.includes('`') && sanitized.includes('${')) {
        return { valid: false, error: `${name} contains invalid characters` };
    }

    return { valid: true, sanitized };
}

/**
 * Validate a Discord snowflake ID.
 * @param {string} id - The ID to validate
 * @param {string} name - Field name for error messages
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSnowflake(id, name = 'ID') {
    if (!id || typeof id !== 'string') {
        return { valid: false, error: `${name} is required` };
    }
    if (!/^\d{17,20}$/.test(id)) {
        return { valid: false, error: `Invalid ${name.toLowerCase()} format` };
    }
    return { valid: true };
}

/**
 * Validate a time duration string.
 * @param {string} input - Duration string (e.g., "1h", "30m", "7d")
 * @returns {{ valid: boolean, error?: string, ms?: number }}
 */
function validateDuration(input) {
    if (!input) return { valid: true, ms: null };

    const match = String(input).match(/^(\d+)([smhdw])$/);
    if (!match) {
        return { valid: false, error: 'Invalid time format. Use: 30s, 5m, 2h, 1d, 1w' };
    }

    const num = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    const ms = num * multipliers[unit];

    // Cap maximum duration at 30 days
    if (ms > 30 * 86400000) {
        return { valid: false, error: 'Maximum duration is 30 days' };
    }

    return { valid: true, ms };
}

/**
 * Check if a member has the required permissions.
 * @param {GuildMember} member - The member to check
 * @param {PermissionFlagsBits[]} required - Required permissions
 * @returns {{ has: boolean, missing?: string[] }}
 */
function checkPermissions(member, required) {
    if (!member || !member.permissions) {
        return { has: false, missing: ['Unknown'] };
    }

    const missing = [];
    for (const perm of required) {
        if (!member.permissions.has(perm)) {
            missing.push(perm);
        }
    }

    return { has: missing.length === 0, missing };
}

/**
 * Check role hierarchy between actor and target.
 * @returns {null|string} null if allowed, error message if denied
 */
function checkHierarchy(actor, target, botMember) {
    if (!target || !actor) return null;

    // Cannot action yourself
    if (actor.id === target.id) {
        return 'You cannot perform this action on yourself';
    }

    // Cannot action server owner
    if (target.id === target.guild?.ownerId) {
        return 'Cannot action the server owner';
    }

    // Target's role must be below actor's highest role
    if (target.roles.highest.position >= actor.roles.highest.position) {
        return 'Cannot action a user with equal or higher roles';
    }

    // Target's role must be below bot's highest role
    if (botMember && target.roles.highest.position >= botMember.roles.highest.position) {
        return 'Cannot action a user above the bot in role hierarchy';
    }

    return null;
}

/**
 * Main command guard function.
 * Wraps command execution with security checks.
 *
 * @param {Function} handler - The original command handler
 * @param {Object} options - Guard options
 * @returns {Function} Wrapped handler
 */
function guard(handler, options = {}) {
    const { rateLimit = true, validateGuild = true } = options;

    return async (interaction, client, db) => {
        const { user, guild } = interaction;

        // Must be in a guild
        if (!interaction.inGuild()) {
            return interaction.reply({
                content: '❌ This command only works in a server.',
                flags: [1 << 6], // Ephemeral
            }).catch(() => {});
        }

        // Rate limit check (user, guild, and per-command)
        if (rateLimit) {
            const userLimit = checkUserRateLimit(user.id);
            if (userLimit) {
                return interaction.reply({
                    content: `⚠️ ${userLimit}`,
                    flags: [1 << 6],
                }).catch(() => {});
            }

            const guildLimit = checkGuildRateLimit(guild.id);
            if (guildLimit) {
                return interaction.reply({
                    content: `⚠️ ${guildLimit}`,
                    flags: [1 << 6],
                }).catch(() => {});
            }

            // Per-command rate limit for privileged commands
            const commandLimit = checkCommandRateLimit(interaction.commandName, user.id);
            if (commandLimit) {
                return interaction.reply({
                    content: `⚠️ ${commandLimit}`,
                    flags: [1 << 6],
                }).catch(() => {});
            }
        }

        // Validate guild exists and bot is in it
        if (validateGuild) {
            const botGuild = client.guilds.cache.get(guild.id);
            if (!botGuild) {
                return interaction.reply({
                    content: '❌ Server not found.',
                    flags: [1 << 6],
                }).catch(() => {});
            }
        }

        // Check maintenance mode
        try {
            const flags = await db.get('dev_flags') || {};
            const expired = flags.maintenanceUntil && Number(flags.maintenanceUntil) <= Date.now();
            if (flags.maintenance && !expired) {
                const owner = process.env.OWNER_ID;
                if (!owner || user.id !== owner) {
                    return interaction.reply({
                        content: `🛠️ ${String(flags.maintenanceMessage || 'EB is temporarily under maintenance.').slice(0, 300)}`,
                        flags: [1 << 6],
                    }).catch(() => {});
                }
            }
        } catch { /* ignore */ }

        // Check if command is disabled
        try {
            const enabledMap = await db.get(`commands_enabled_${guild.id}`) || {};
            if (enabledMap[interaction.commandName] === false) {
                return interaction.reply({
                    content: '🚫 This command has been disabled by a server administrator.',
                    flags: [1 << 6],
                }).catch(() => {});
            }
        } catch { /* ignore */ }

        // Log command usage
        logger.command(interaction.commandName, user, guild);
        try { require('eb-bot-shared/services/analytics').trackCommand(guild.id, interaction.commandName); } catch { /* ignore */ }

        // Security event logging for privileged commands
        const PRIVILEGED_COMMANDS = new Set([
            'ban', 'kick', 'timeout', 'unban', 'untimeout',
            'warn', 'removewarn', 'clear', 'softban', 'lockdown',
            'role', 'setnick', 'leave', 'config', 'backup', 'restore',
        ]);

        if (PRIVILEGED_COMMANDS.has(interaction.commandName)) {
            try {
                const { recordDeveloperAction } = require('eb-bot-shared/services/developer-audit');
                recordDeveloperAction(
                    { session: { user: { id: user.id } }, requestId: `cmd-${Date.now()}` },
                    `bot.command.${interaction.commandName}`,
                    guild.id,
                    'success',
                    { userId: user.id, username: user.username }
                );
            } catch { /* audit must never fail command execution */ }
        }

        // Execute the command
        try {
            return await handler(interaction, client, db);
        } catch (err) {
            const errorId = require('crypto').randomBytes(5).toString('hex');
            logger.error(`Command error: /${interaction.commandName}`, {
                errorId,
                error: err.message,
                stack: err.stack,
                guildId: guild.id,
                userId: user.id,
            });

            // Log failed privileged command attempts
            if (PRIVILEGED_COMMANDS.has(interaction.commandName)) {
                try {
                    const { recordDeveloperAction } = require('eb-bot-shared/services/developer-audit');
                    recordDeveloperAction(
                        { session: { user: { id: user.id } }, requestId: `cmd-${Date.now()}` },
                        `bot.command.${interaction.commandName}.failed`,
                        guild.id,
                        'error',
                        { userId: user.id, error: err.message }
                    );
                } catch { /* audit must never fail */ }
            }

            const EmbedHelper = require('eb-bot-shared/utils/embed');
            const embed = EmbedHelper.error(
                `The command could not be completed. Error ID: \`${errorId}\``,
                client
            );

            await interaction.reply({
                embeds: [embed],
                flags: [1 << 6],
            }).catch(() => {});
        }
    };
}

module.exports = {
    guard,
    checkUserRateLimit,
    checkGuildRateLimit,
    validateStringInput,
    validateSnowflake,
    validateDuration,
    checkPermissions,
    checkHierarchy,
    MAX_STRING_LENGTH,
    MAX_REASON_LENGTH,
    MAX_EMBED_FIELDS,
    MAX_EMBED_FIELD_VALUE,
};
