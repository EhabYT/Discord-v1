/**
 * Unified security pipeline middleware.
 *
 * Implements the sequential security flow from the architecture diagram:
 *   Request → Authenticate → Rate Limit → Validate Input → Session →
 *   RBAC → Guild Membership → Bot Installed → Discord Permission →
 *   Resource Authorization → Action → Audit Log → Response
 *
 * This module orchestrates the existing security middleware into a clear,
 * documented pipeline. Each step is independent and can fail independently.
 *
 * SECURITY PROPERTIES:
 *   - Authentication happens before authorization
 *   - Authorization happens before any privileged operation
 *   - Every denied request is logged for audit
 *   - Trust boundaries are explicit and enforced
 */

const { requireAuth } = require('./auth');
const { validateGuild, requireGuildMember, requirePerm } = require('./guild-access');
const rl = require('./rate-limit');
const { recordDeveloperAction } = require('eb-bot-shared/services/developer-audit');
const logger = require('eb-bot-shared/lib/logger');

/**
 * Security pipeline for guild-scoped routes.
 *
 * Executes the full security flow in the correct order:
 *   1. Authenticate — is the user logged in?
 *   2. Rate Limit — is this user within allowed request limits?
 *   3. Validate Guild — does the guild exist and is the bot in it?
 *   4. Guild Membership — is the user actually a member?
 *   5. Permission Level — does the user have the required role level?
 *
 * @param {Object} botClient - Discord.js client
 * @param {number} minLevel - Minimum guild permission level (0-3)
 * @param {Object} options - { rateLimit: { name, max, windowMs } }
 */
function guildSecurityPipeline(botClient, minLevel = 0, options = {}) {
    const middlewares = [
        // Step 1: Authentication
        requireAuth,

        // Step 2: Rate limiting (if configured)
        ...(options.rateLimit ? [rl.limit(options.rateLimit.name, options.rateLimit.max, options.rateLimit.windowMs)] : []),

        // Step 3: Guild validation (bot is in guild, valid snowflake)
        validateGuild(botClient),

        // Step 4: Guild membership verification (IDOR protection)
        requireGuildMember,

        // Step 5: Permission level check
        requirePerm(botClient, minLevel),
    ];

    return middlewares;
}

/**
 * Security pipeline for system-level (developer) routes.
 *
 * Executes:
 *   1. Authentication
 *   2. Rate Limiting
 *   3. System Role Check (via requireSystemRole in route)
 *
 * @param {Object} options - { rateLimit: { name, max, windowMs } }
 */
function systemSecurityPipeline(options = {}) {
    const middlewares = [
        requireAuth,
        ...(options.rateLimit ? [rl.limit(options.rateLimit.name, options.rateLimit.max, options.rateLimit.windowMs)] : []),
    ];

    return middlewares;
}

/**
 * Audit-aware wrapper for route handlers.
 *
 * Logs the action to the developer audit trail after successful execution,
 * and logs authorization failures for security monitoring.
 *
 * @param {string} action - Action name (e.g. 'guild.ban', 'guild.settings.update')
 * @param {Function} handler - The actual route handler
 */
function auditWrap(action, handler) {
    return async (req, res, next) => {
        const startTime = Date.now();
        const originalJson = res.json.bind(res);

        // Intercept json to capture response status
        res.json = function (body) {
            const duration = Date.now() - startTime;
            const success = res.statusCode < 400;

            // Record audit event for privileged operations
            if (action && req.userId) {
                try {
                    const target = req.params.guildId || req.params.userId || 'system';
                    recordDeveloperAction(req, action, target, success ? 'success' : 'denied', {
                        statusCode: res.statusCode,
                        duration,
                    });
                } catch { /* audit must never fail the request */ }
            }

            // Log security-relevant failures
            if (!success && res.statusCode >= 403) {
                logger.warn('Security pipeline denial', {
                    action,
                    userId: req.userId,
                    guildId: req.params.guildId,
                    statusCode: res.statusCode,
                    path: req.originalUrl,
                    requestId: req.requestId,
                });
            }

            return originalJson(body);
        };

        try {
            return await handler(req, res, next);
        } catch (err) {
            // Log errors with context
            logger.error('Security pipeline error', {
                action,
                error: err.message,
                userId: req.userId,
                guildId: req.params.guildId,
                path: req.originalUrl,
                requestId: req.requestId,
            });
            throw err;
        }
    };
}

/**
 * Middleware that verifies the bot is installed in the target guild.
 * This is a critical check before any privileged operation.
 */
function requireBotInstalled(botClient) {
    return (req, res, next) => {
        if (!botClient || !botClient.user) {
            return res.status(503).json({ error: 'Bot is initializing', code: 'BOT_INITIALIZING' });
        }

        const guild = req.guild || botClient.guilds.cache.get(req.params.guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Server not found', code: 'GUILD_NOT_FOUND' });
        }

        // Verify bot is actually in this guild
        if (!guild.members.me) {
            return res.status(404).json({ error: 'Server not found', code: 'GUILD_NOT_FOUND' });
        }

        return next();
    };
}

/**
 * Middleware that verifies the target user exists and is actionable.
 * Checks role hierarchy, self-action prevention, and bannable/kickable status.
 */
function validateTargetUser(botClient) {
    return async (req, res, next) => {
        const targetId = req.params.userId || req.body?.userId;
        if (!targetId || !/^\d{17,20}$/.test(String(targetId))) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const guild = req.guild || botClient?.guilds?.cache?.get(req.params.guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Cannot action yourself
        if (req.userId === targetId) {
            return res.status(400).json({ error: 'Cannot perform this action on yourself' });
        }

        // Cannot action the bot
        if (botClient?.user && targetId === botClient.user.id) {
            return res.status(400).json({ error: 'Cannot perform this action on the bot' });
        }

        // Cannot action the server owner
        if (targetId === guild.ownerId) {
            return res.status(403).json({ error: 'Cannot action the server owner' });
        }

        // Check role hierarchy
        const target = await guild.members.fetch(targetId).catch(() => null);
        if (!target) {
            return res.status(404).json({ error: 'User not found in this server' });
        }

        const actorId = req.userId;
        let actor = null;
        if (actorId) {
            actor = await guild.members.fetch(actorId).catch(() => null);
            if (actor && target.roles.highest.position >= actor.roles.highest.position) {
                return res.status(403).json({ error: 'Cannot action a user with equal or higher roles' });
            }
        }

        // Check bot hierarchy
        const botMember = guild.members.me;
        if (botMember && target.roles.highest.position >= botMember.roles.highest.position) {
            return res.status(403).json({ error: 'Cannot action a user above the bot in role hierarchy' });
        }

        // Attach validated target and actor to request
        const targetMember = target;
        const actorMember = actor;
        Object.assign(req, { targetMember, actorMember });
        return next();
    };
}

module.exports = {
    guildSecurityPipeline,
    systemSecurityPipeline,
    auditWrap,
    requireBotInstalled,
    validateTargetUser,
};
