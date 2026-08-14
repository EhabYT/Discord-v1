const { Events } = require('discord.js');

async function handleReactionRole(reaction, user, client, adding) {
    if (!user || user.bot) return;
    if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
        try { await reaction.message.fetch(); } catch { return; }
    }
    const guild = reaction.message.guild;
    if (!guild) return;

    const db = client?.db || reaction.message.client?.db;
    if (!db) return;

    const statsKey = `stats_${guild.id}_${user.id}`;
    let stats = await db.get(statsKey) || { messages: 0, voiceTime: 0, reactions: 0 };
    stats.reactions = Math.max(0, (stats.reactions || 0) + (adding ? 1 : -1));
    await db.set(statsKey, stats);

    const { normalize, applyMapping, findForReaction } = require('../../../shared/services/reaction-roles');
    const mappings = normalize(await db.get(`reactionroles_${guild.id}`) || []);
    const mapping = findForReaction(mappings, reaction.message.id, reaction);
    if (!mapping) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    try {
        await applyMapping(member, mapping, adding, mappings);
    } catch (err) {
        const logger = require('../../../shared/lib/logger');
        logger.error('Reaction role failed', { error: err.message, guild: guild.id, user: user.id });
    }
}

module.exports = [
    {
        name: Events.MessageReactionAdd,
        async execute(reaction, user, client) {
            await handleReactionRole(reaction, user, client, true);
        }
    },
    {
        name: Events.MessageReactionRemove,
        async execute(reaction, user, client) {
            await handleReactionRole(reaction, user, client, false);
        }
    }
];
