const fs = require('fs');
const path = require('path');
const logger = require('../../../shared/lib/logger');

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
        let registered = 0;
        fs.readdirSync(playerEventsDir)
            .filter(file => file.endsWith('.js'))
            .forEach(file => {
                const event = require(path.join(playerEventsDir, file));
                if (!event.name || typeof event.execute !== 'function') {
                    logger.error(`Player event file ${file} is missing a name or execute().`);
                    return;
                }
                client.player.events.on(event.name,
                    safeDispatch('Player', event.name, (...args) => event.execute(...args)));
                registered++;
            });
        // A handler named "error" is normal; avoid logging
        // "Loaded Player Event: error", which looks like a failure in hosting
        // dashboards even though it only reports successful registration.
        logger.debug(`Registered ${registered} player event handlers`);
    }
}

/**
 * Error boundary for a single event dispatch.
 *
 * Every handler in this directory is `async`, and discord.js ignores the
 * promise a listener returns. Without this wrapper any rejection — including
 * one thrown outside a handler's own try/catch — escapes to
 * process.on('unhandledRejection'), where it is only logged. The event is then
 * silently lost with no indication of which handler failed.
 *
 * Wrapping at the dispatch layer means every current and future handler is
 * covered by construction, rather than depending on each one remembering to
 * catch its own errors.
 */
function safeDispatch(kind, name, fn) {
    return (...args) => {
        let result;
        try {
            result = fn(...args);
        } catch (err) {
            logger.error(`${kind} event handler threw: ${name}`, {
                error: err?.message || String(err),
                stack: err?.stack,
            });
            return undefined;
        }
        if (result && typeof result.then === 'function') {
            return result.catch((err) => {
                logger.error(`${kind} event handler rejected: ${name}`, {
                    error: err?.message || String(err),
                    stack: err?.stack,
                });
            });
        }
        return result;
    };
}

function registerClientEvent(client, event, file) {
    if (!event.name) {
        logger.error(`Event file ${file} is missing a name.`);
        return;
    }
    if (typeof event.execute !== 'function') {
        logger.error(`Event file ${file} is missing an execute() function.`);
        return;
    }

    const handler = safeDispatch('Client', event.name,
        (...args) => event.execute(...args, client));

    if (event.once) {
        client.once(event.name, handler);
    } else {
        client.on(event.name, handler);
    }
    logger.debug(`Loaded Client Event: ${event.name}`);
}

module.exports = { loadEvents };
