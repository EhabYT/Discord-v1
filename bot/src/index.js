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

// Start the HTTP service before connecting to Discord. Render needs a listening
// port to route OAuth callbacks; previously a missing/invalid bot credential
// exited first and the public hostname returned `x-render-routing: no-server`.
// Keeping the dashboard alive also makes /api/health report botOnline:false,
// which is far more actionable than a platform-level 404.
startDashboard(client);

// Startup Logic
(async () => {
  // Run Diagnostics. Configuration failures keep the dashboard online so the
  // operator can inspect health and fix environment variables without losing
  // the OAuth callback endpoint.
  if (!(await runDiagnostics(db))) {
    logger.error('Startup diagnostics failed. Dashboard remains online; bot connection is paused until configuration is fixed.');
    return;
  }

  // Load Music Extractors
  try {
    const { DefaultExtractors } = require('@discord-player/extractor');
    // AttachmentExtractor is safe to load: package.json pins the compatible
    // local file-type backport, whose malformed-ASF regression is tested in CI.
    await player.extractors.loadMulti(DefaultExtractors);
    logger.info(`Music extractors loaded (${DefaultExtractors.length})`);
  } catch (err) {
    logger.error('Extractor error', { error: err.message });
  }

  // Register Events
  loadEvents(client);

  // Register Scheduler Jobs
  registerJobs(client, scheduler);

  // Command registration is an explicit deployment action. The previous
  // `|| !GUILD_ID` condition re-registered all global commands on every boot
  // whenever GUILD_ID was empty, despite DEPLOY_COMMANDS=false.
  if (process.env.DEPLOY_COMMANDS === 'true') {
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

  // Login failures must not take down the web dashboard or OAuth callback.
  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    logger.error('Discord login failed. Dashboard remains online.', {
      error: err?.message || String(err),
    });
  }
})();