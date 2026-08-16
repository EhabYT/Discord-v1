const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const logger = require('../lib/logger');

async function deployCommands(token, clientId, guildId = null, extraGuildIds = [], syncGlobal = null) {
    const commands = [];
    const commandsPath = path.join(__dirname, '../../bot/src/commands');

    if (!fs.existsSync(commandsPath)) {
        return logger.error('Commands directory not found');
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command.data) {
                commands.push(command.data.toJSON());
            }
        } catch (err) {
            logger.error(`Failed to load command ${file}`, { error: err.message });
        }
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const extras = Array.isArray(extraGuildIds) ? extraGuildIds : [];
    const shouldSyncGlobal = syncGlobal ?? (process.env.SYNC_GLOBAL_COMMANDS !== 'false');

    try {
        logger.info(`Registering ${commands.length} commands...`);
        const guildIds = [...new Set([guildId, ...extras].filter(Boolean))];

        for (const gid of guildIds) {
            await rest.put(Routes.applicationGuildCommands(clientId, gid), { body: commands });
            logger.info(`Successfully registered ${commands.length} guild commands (${gid})`);
        }

        // Keep global in sync so other / future guilds get the full set (limit is 100)
        if (shouldSyncGlobal && commands.length <= 100) {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            logger.info(`Successfully registered ${commands.length} global commands`);
        } else if (!guildIds.length) {
            logger.error('Too many commands for global deploy and no guild id provided');
        }
    } catch (err) {
        logger.error('Failed to register commands', { error: err.message });
    }
}

async function runDiagnostics(db) {
    logger.info('Running startup diagnostics...');
    let databaseReady = false;
    try {
        databaseReady = !!db && await db.ready();
    } catch (err) {
        logger.error('Database connection failed', { error: err.message });
    }
    const checks = {
        'Environment Variables': !!(process.env.DISCORD_TOKEN && process.env.CLIENT_ID),
        'Commands Directory': fs.existsSync(path.join(__dirname, '../../bot/src/commands')),
        'Supabase PostgreSQL': databaseReady
    };

    for (const [name, passed] of Object.entries(checks)) {
        if (passed) logger.debug(`[PASS] ${name}`);
        else logger.error(`[FAIL] ${name}`);
    }

    return Object.values(checks).every(v => v);
}

module.exports = { deployCommands, runDiagnostics };
