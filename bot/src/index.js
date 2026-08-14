require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { Player } = require('discord-player');
const { db } = require('../../database/index');

const logger = require('../../shared/lib/logger');
const scheduler = require('./scheduler.js');
const { loadEvents } = require('./events');
const { registerJobs } = require('../../shared/services/scheduler-jobs');
const { deployCommands, runDiagnostics } = require('../../shared/services/startup');
const { startDashboard } = require('../../backend/src/server');

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
client.helpers = require('../../shared/utils/discord');
client.config = require('../../config/bot.json');

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

  // ── Global Error Handling ──
  // A rejection value is not guaranteed to be an Error: `Promise.reject('x')`,
  // axios and discord.js can all surface strings, plain objects or null.
  // Reading `.message` off those yields undefined at best and throws at worst —
  // i.e. the error handler itself becomes the crash.
  const describe = (value) => {
    if (value instanceof Error) return { error: value.message, stack: value.stack };
    if (value && typeof value === 'object') {
      try { return { error: JSON.stringify(value).slice(0, 500), stack: null }; }
      catch { return { error: '[unserialisable rejection value]', stack: null }; }
    }
    return { error: String(value), stack: null };
  };

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', describe(reason));
  });

  process.on('uncaughtException', (error) => {
    // Node's contract: after an uncaught exception the process is in an
    // undefined state. Continuing risks corrupt SQLite writes and half-applied
    // moderation actions, so log, give the stream a moment to flush, then exit
    // non-zero and let the supervisor restart us cleanly.
    logger.error('Uncaught Exception — shutting down', describe(error));
    setTimeout(() => process.exit(1), 250).unref();
  });

  // Login
  client.login(process.env.DISCORD_TOKEN);

  // Start Dashboard
  startDashboard(client);
})();