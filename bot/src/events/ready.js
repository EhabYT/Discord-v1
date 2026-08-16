const { Events, Collection } = require('discord.js');
const logger = require('../../../shared/lib/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info(`Bot logged in as ${client.user.tag}`);
        client.invites = new Collection();

        try {
            const saved = await client.db.get('bot_presence').catch(() => null);
            const status = saved?.status || 'online';
            const text = saved?.activityText || '/help · dashboard';
            const type = Number.isInteger(saved?.activityType) ? saved.activityType : 3;
            await client.user.setPresence({
                status,
                activities: text ? [{ name: text, type }] : []
            });
        } catch (err) {
            logger.debug(`Could not set presence: ${err.message}`);
        }

        if (process.env.DEPLOY_COMMANDS === 'true') {
            const extra = [...client.guilds.cache.keys()].filter(id => id !== process.env.GUILD_ID);
            if (extra.length) {
                try {
                    const { deployCommands } = require('../../../shared/services/startup');
                    await deployCommands(process.env.DISCORD_TOKEN, process.env.CLIENT_ID, null, extra, false);
                } catch (err) {
                    logger.error('Failed to deploy commands to extra guilds', { error: err.message });
                }
            }
        }

        // Cache invites
        const guilds = client.guilds.cache.map(g => g);

        for (const guild of guilds) {
            try {
                const firstInvites = await guild.invites.fetch();
                client.invites.set(guild.id, new Collection(firstInvites.map(invite => [invite.code, invite.uses])));
                logger.debug(`Cached ${firstInvites.size} invites for guild: ${guild.name}`);
            } catch (err) {
                logger.error(`Error caching invites for ${guild.name}`, { error: err.message });
            }
        }
    }
};
