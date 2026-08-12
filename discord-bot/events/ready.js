const { Events, Collection } = require('discord.js');
const logger = require('../utils_logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.info(`Bot logged in as ${client.user.tag}`);

        // Cache invites
        client.invites = new Collection();
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
