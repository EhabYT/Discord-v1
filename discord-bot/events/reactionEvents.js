const { Events } = require('discord.js');

module.exports = [
    {
        name: Events.MessageReactionAdd,
        async execute(reaction, user, client) {
            if (!user || user.bot || !reaction || !reaction.message || !reaction.message.guild) return;
            const db = client?.db || reaction.message.client?.db;
            if (!db) return;
            const statsKey = `stats_${reaction.message.guild.id}_${user.id}`;
            let stats = await db.get(statsKey) || { messages: 0, voiceTime: 0, reactions: 0 };
            stats.reactions++;
            await db.set(statsKey, stats);
        }
    },
    {
        name: Events.MessageReactionRemove,
        async execute(reaction, user, client) {
            if (!user || user.bot || !reaction || !reaction.message || !reaction.message.guild) return;
            const db = client?.db || reaction.message.client?.db;
            if (!db) return;
            const statsKey = `stats_${reaction.message.guild.id}_${user.id}`;
            let stats = await db.get(statsKey) || { messages: 0, voiceTime: 0, reactions: 0 };
            stats.reactions = Math.max(0, (stats.reactions || 0) - 1);
            await db.set(statsKey, stats);
        }
    }
];
