const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const logger = require('../utils_logger');

async function deployCommands(token, clientId, guildId = null) {
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');

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

    try {
        logger.info(`Registering ${commands.length} commands...`);

        if (guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
            logger.info(`Successfully registered ${commands.length} guild commands`);
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            logger.info(`Successfully registered ${commands.length} global commands`);
        }
    } catch (err) {
        logger.error('Failed to register commands', { error: err.message });
    }
}

async function runDiagnostics(db) {
    logger.info('Running startup diagnostics...');
    const checks = {
        'Environment Variables': !!(process.env.DISCORD_TOKEN && process.env.CLIENT_ID),
        'Commands Directory': fs.existsSync(path.join(__dirname, '../commands')),
        'Database Connection': !!db
    };

    for (const [name, passed] of Object.entries(checks)) {
        if (passed) logger.debug(`[PASS] ${name}`);
        else logger.error(`[FAIL] ${name}`);
    }

    return Object.values(checks).every(v => v);
}

module.exports = { deployCommands, runDiagnostics };
