require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { Player } = require('discord-player');
const { db } = require('./utils/db_wrapper');

const logger = require('./utils_logger');
const scheduler = require('./scheduler.js');
const { loadEvents } = require('./events');
const { registerJobs } = require('./utils/scheduler_jobs');
const { deployCommands, runDiagnostics } = require('./utils/startup');
const { startDashboard } = require('./dashboard/server');

// Initialize Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User
  ]
});

// Attach properties to client
client.commands = new Collection();
client.db = db;
client.helpers = require('./utils/helpers');
client.config = require('./config.json');

// Initialize Music Player
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
    filter: 'audioonly'
  }
});

client.player = player;

// Load Commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        logger.debug(`Loaded command: ${command.data.name}`);
      }
    } catch (err) {
      logger.error(`Load error for command ${file}`, { error: err.message });
    }
  }
}

// Startup Logic
(async () => {
  // Run Diagnostics
  if (!(await runDiagnostics(db))) {
    logger.error('Startup diagnostics failed. Shutting down...');
    process.exit(1);
  }

  // Load Music Extractors
  try {
    const { DefaultExtractors } = require('@discord-player/extractor');
    await player.extractors.loadMulti(DefaultExtractors);
    logger.info('Music extractors loaded');
  } catch (err) {
    logger.error('Extractor error', { error: err.message });
  }

  // Register Events
  loadEvents(client);

  // Register Scheduler Jobs
  registerJobs(client, scheduler);

  // Deploy Commands (Optimization: only on demand or env flag)
  if (process.env.DEPLOY_COMMANDS === 'true' || !process.env.GUILD_ID) {
    await deployCommands(process.env.DISCORD_TOKEN, process.env.CLIENT_ID, process.env.GUILD_ID || null);
  }

  // Global Error Handling
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', { error: reason.message, stack: reason.stack });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  });

  // Login
  client.login(process.env.DISCORD_TOKEN);

  // Start Dashboard
  startDashboard(client);
})();