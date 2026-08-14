/**
 * Shared guild-scoped access control.
 *
 * ROOT CAUSE THIS ADDRESSES
 * -------------------------
 * These guards were defined as closures inside `routes/guilds.js`, so they were
 * reachable only from that file. When `routes/permissions.js` was mounted at
 * `/api/guild/:guildId/permissions` — which Express matches BEFORE
 * `/api/guild/:guildId` — it inherited none of them, and shipped readable with
 * no session at all and across guilds the caller did not belong to.
 *
 * The fix at the time was to hand-write an equivalent gate in permissions.js.
 * That left two implementations of the same security rule, which is how the
 * next divergence happens: fix one, forget the other.
 *
 * Defining them here means any router can `require` them, and a third router
 * added tomorrow cannot silently miss the stack.
 *
 * LAYERS (each independent, applied in this order)
 *   validateGuild      — is :guildId a real snowflake for a guild the bot is in?
 *   requireGuildMember — is the caller actually a member of it?  (IDOR)
 *   requirePerm(level) — do they hold the needed dashboard level?
 *   hierarchyError     — may they act on THIS target?  (Discord hierarchy)
 */

const { getUserPermLevel } = require('./permissions');
const { allowAnonymous, sessionUserId } = require('./auth');

const SNOWFLAKE = /^\d{17,20}$/;
const LEVEL_NAMES = ['Viewer', 'DJ', 'Moderator', 'Admin'];

/**
 * Resolve `:guildId` to a live guild and attach it as `req.guild`.
 *
 * ORDERING MATTERS. This runs AFTER authentication, deliberately.
 *
 * When guild resolution ran first, an unauthenticated caller could tell a real
 * guild from a fake one by the status code alone — a real guild fell through to
 * `401`, an unknown one returned `404`. That is an existence oracle: it lets
 * anyone enumerate which servers the bot is in without ever logging in.
 *
 * Both outcomes are now indistinguishable to an anonymous caller, because
 * requireAuthedGuildAccess() authenticates before this middleware runs.
 */
function validateGuild(botClient) {
    return (req, res, next) => {
        const { guildId } = req.params;
        if (!SNOWFLAKE.test(String(guildId || ''))) {
            // Malformed and unknown ids return the same shape, for the same reason.
            return res.status(404).json({ error: 'Server not found' });
        }
        if (!botClient) return res.status(503).json({ error: 'Bot is initializing' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Server not found' });

        req.guild = guild;
        return next();
    };
}

/**
 * Prevent cross-guild access (IDOR). Being signed in must not grant reach into
 * every guild the bot serves — only those the caller belongs to.
 *
 * Anonymous requests fall through: requirePerm() decides whether the localhost
 * development bypass applies. Keeping that decision in one place avoids two
 * different answers to "is anonymous allowed here?".
 */
function requireGuildMember(req, res, next) {
    const userId = sessionUserId(req);
    if (!userId) return next();

    const { guildId } = req.params;
    const fromOAuth = req.session?.userGuilds;
    if (Array.isArray(fromOAuth) && fromOAuth.some((g) => String(g.id) === String(guildId))) {
        return next();
    }
    // The OAuth guild list can be stale or absent; fall back to gateway state.
    //
    // Check the RESOLVED VALUE, not merely that the promise settled. A cache
    // miss resolves with null rather than rejecting, so `.then(() => next())`
    // would wave through a non-member. This was introduced during the middleware
    // extraction and caught by test-isolation.js.
    return req.guild.members.fetch(userId)
        .catch(() => null)
        .then((member) => {
            if (member) return next();
            return res.status(403).json({
                error: 'You are not a member of this server', code: 'NOT_A_MEMBER',
            });
        });
}

/** Require a minimum dashboard permission level (0 Viewer … 3 Admin). */
function requirePerm(botClient, minLevel) {
    return async (req, res, next) => {
        const userId = sessionUserId(req);
        if (!userId) {
            // Fails CLOSED: only an explicit DASHBOARD_AUTH=false from loopback
            // may proceed. See middleware/auth.js.
            if (allowAnonymous(req)) return next();
            return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
        }
        const level = await getUserPermLevel(botClient, req.params.guildId, userId);
        if (level < minLevel) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: LEVEL_NAMES[minLevel],
                yours: LEVEL_NAMES[level],
            });
        }
        return next();
    };
}

/**
 * Discord role-hierarchy guard, mirroring the slash commands
 * (see commands/ban.js). Returns an error string, or null when allowed.
 *
 * Must be applied to EVERY path that acts on a member — including bulk sweeps,
 * which is where it was previously omitted.
 */
async function hierarchyError(req, target) {
    const guild = req.guild;
    if (target.id === guild.ownerId) return 'Cannot action the server owner';

    const botMember = guild.members.me;
    if (botMember && target.roles.highest.position >= botMember.roles.highest.position) {
        return "Target's highest role is above the bot's — move the bot's role up";
    }

    // An anonymous localhost dev session has no Discord identity to compare.
    const actorId = sessionUserId(req);
    if (!actorId) return null;
    if (actorId === guild.ownerId) return null;

    const actor = await guild.members.fetch(actorId).catch(() => null);
    if (!actor) return 'You are not a member of this server';
    if (target.id === actorId) return 'You cannot action yourself';
    if (target.roles.highest.position >= actor.roles.highest.position) {
        return 'Target has a role equal to or above yours';
    }
    return null;
}

/**
 * Authentication gate used ahead of guild resolution.
 *
 * Split out from requirePerm so that "are you signed in?" can be answered
 * before "does this guild exist?", closing the existence oracle described on
 * validateGuild(). Permission level is still checked afterwards, once we know
 * which guild we are talking about.
 */
function requireAuthenticated(req, res, next) {
    if (sessionUserId(req)) return next();
    if (allowAnonymous(req)) return next();
    return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
}

/**
 * The standard stack for any guild-scoped router. Mount with `router.use(...)`.
 * A new router gets the complete, correct chain in one line — and in the right
 * order, which is the part that is easy to get wrong by hand.
 *
 *   1. authenticated?      → 401 (before anything is revealed)
 *   2. guild real?         → 404
 *   3. caller a member?    → 403  (IDOR)
 *   4. sufficient level?   → 403
 */
function guildAccessStack(botClient, minLevel = 0) {
    return [
        requireAuthenticated,
        validateGuild(botClient),
        requireGuildMember,
        requirePerm(botClient, minLevel),
    ];
}

module.exports = {
    validateGuild, requireGuildMember, requirePerm, hierarchyError,
    requireAuthenticated, guildAccessStack, SNOWFLAKE, LEVEL_NAMES,
};
