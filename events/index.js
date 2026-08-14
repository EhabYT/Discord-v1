const fs = require('fs');
const path = require('path');
const logger = require('../utils_logger');

/**
 * Loads and registers events for both Discord client and Music player.
 * @param {import('discord.js').Client} client 
 */
function loadEvents(client) {
    const eventsDir = __dirname;
    const playerEventsDir = path.join(eventsDir, 'player');

    // Optimization: Read all files once and filter
    const allFiles = fs.readdirSync(eventsDir, { withFileTypes: true });

    // Load Client Events
    allFiles
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.js') && dirent.name !== 'index.js')
        .forEach(dirent => {
            const event = require(path.join(eventsDir, dirent.name));
            if (Array.isArray(event)) {
                event.forEach(e => registerClientEvent(client, e, dirent.name));
            } else {
                registerClientEvent(client, event, dirent.name);
            }
        });

    // Load Player Events
    if (client.player && fs.existsSync(playerEventsDir)) {
        fs.readdirSync(playerEventsDir)
            .filter(file => file.endsWith('.js'))
            .forEach(file => {
                const event = require(path.join(playerEventsDir, file));
                client.player.events.on(event.name, (...args) => event.execute(...args));
                logger.debug(`Loaded Player Event: ${event.name}`);
            });
    }
}

function registerClientEvent(client, event, file) {
    if (!event.name) {
        logger.error(`Event file ${file} is missing a name.`);
        return;
    }

    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    logger.debug(`Loaded Client Event: ${event.name}`);
}

module.exports = { loadEvents };
