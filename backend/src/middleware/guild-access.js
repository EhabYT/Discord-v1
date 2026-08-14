'use strict';

const { requireAuth } = require('./auth');

const SNOWFLAKE = /^\d{17,20}$/;

function validateGuild(botClient) {
    return (req, res, next) => {
        const { guildId } = req.params;
        // Return the same result for malformed and unknown ids. Authentication
        // runs first, so anonymous callers cannot use this as a guild oracle.
        if (!SNOWFLAKE.test(String(guildId || ''))) {
            return res.status(404).json({ error: 'Server not found', code: 'GUILD_NOT_FOUND' });
        }
        if (!botClient) return res.status(503).json({ error: 'Bot is initializing' });
        const guild = botClient.guilds?.cache?.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Server not found', code: 'GUILD_NOT_FOUND' });
        req.guild = guild;
        next();
    };
}

function requireGuildMember() {
    return async (req, res, next) => {
        const userId = req.session?.user?.id;
        if (!userId) return next(); // explicit localhost bypass only

        const oauthGuilds = req.session?.userGuilds;
        if (Array.isArray(oauthGuilds)) {
            if (oauthGuilds.some((guild) => String(guild.id) === req.params.guildId)) return next();
            return res.status(403).json({ error: 'You are not a member of this server', code: 'NOT_A_MEMBER' });
        }

        const member = await req.guild.members.fetch(userId).catch(() => null);
        if (member) return next();
        return res.status(403).json({ error: 'You are not a member of this server', code: 'NOT_A_MEMBER' });
    };
}

function guildAccessStack(botClient) {
    return [requireAuth, validateGuild(botClient), requireGuildMember()];
}

function hierarchyError(guild, actor, target) {
    if (!actor || !target) return 'Member not found';
    if (target.id === guild.ownerId) return 'The server owner cannot be moderated';
    if (target.id === actor.id) return 'You cannot moderate yourself';
    const botHighest = guild.members?.me?.roles?.highest?.position ?? -1;
    const targetHighest = target.roles?.highest?.position ?? 0;
    const actorHighest = actor.roles?.highest?.position ?? 0;
    if (targetHighest >= botHighest) return 'The bot role is not high enough';
    if (targetHighest >= actorHighest) return 'You cannot moderate a member at or above your role';
    return null;
}

module.exports = {
    SNOWFLAKE,
    validateGuild,
    requireGuildMember,
    guildAccessStack,
    hierarchyError,
};
