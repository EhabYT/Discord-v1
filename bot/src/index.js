require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { Player } = require('discord-player');
const { db, closePool } = require('../../database/index');
const { config: botConfig } = require('../../shared/config/bot-config');

const logger = require('../../shared/lib/logger');
const scheduler = require('./scheduler.js');
const { loadEvents } = require('./events');
const { registerJobs } = require('../../shared/services/scheduler-jobs');
const { deployCommands, runDiagnostics } = require('../../shared/services/startup');
const { startDashboard, stopDashboard } = require('eb-bot-backend');

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
client.config = botConfig;

// Initialize Music Player
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
    filter: 'audioonly'
  }
});

client.player = player;

// Load Commands recursively from categorized subdirectories
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  function loadCommands(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        loadCommands(fullPath);
      } else if (entry.endsWith('.js')) {
        try {
          const command = require(fullPath);
          if (command.data && command.execute) {
            client.commands.set(command.data.name, command);
            logger.debug(`Loaded command: ${command.data.name}`);
          }
        } catch (err) {
          logger.error(`Load error for ${fullPath}`, { error: err.message });
        }
      }
    }
  }
  loadCommands(commandsPath);
}

// Global error handling is installed before diagnostics so a failed bootstrap
// can never produce an unobserved rejection while the dashboard stays online.
const describe = (value) => {
  if (value instanceof Error) return { error: value.message, stack: value.stack };
  if (value && typeof value === 'object') {
    try { return { error: JSON.stringify(value).slice(0, 500), stack: null }; }
    catch { return { error: '[unserialisable rejection value]', stack: null }; }
  }
  return { error: String(value), stack: null };
};
process.on('unhandledRejection', (reason) => logger.error('Unhandled Rejection', describe(reason)));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception — shutting down', describe(error));
  setTimeout(() => process.exit(1), 250).unref();
});

// Start the HTTP service before connecting to Discord. Render needs a listening
// port to route OAuth callbacks even while Discord or Supabase is recovering.
startDashboard(client);

client.bootstrapState = {
  state: 'starting', attempt: 0, nextRetryAt: null, lastError: null,
};
let servicesLoaded = false;
let retryTimer = null;

function scheduleRetry(reason) {
  if (retryTimer) return;
  client.bootstrapState.attempt += 1;
  const delay = Math.min(5 * 60_000, 15_000 * (2 ** Math.min(client.bootstrapState.attempt - 1, 5)));
  client.bootstrapState.state = 'waiting';
  client.bootstrapState.lastError = reason;
  client.bootstrapState.nextRetryAt = Date.now() + delay;
  logger.warn(`Bot bootstrap will retry in ${Math.round(delay / 1000)}s`, { reason });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    bootstrap().catch((err) => {
      logger.error('Bot bootstrap retry failed', { error: err?.message || String(err) });
      scheduleRetry('Unexpected bootstrap failure');
    });
  }, delay);
  retryTimer.unref();
}

/* eslint-disable require-atomic-updates -- bootstrap attempts are serialized by retryTimer; these assignments intentionally publish lifecycle state after awaited I/O. */
async function loadServicesOnce() {
  if (servicesLoaded) return;
  try {
    const { DefaultExtractors } = require('@discord-player/extractor');
    await player.extractors.loadMulti(DefaultExtractors);
    logger.info(`Music extractors loaded (${DefaultExtractors.length})`);
  } catch (err) {
    logger.error('Extractor error', { error: err.message });
  }
  loadEvents(client);
  registerJobs(client, scheduler);
  if (process.env.DEPLOY_COMMANDS === 'true') {
    await deployCommands(process.env.DISCORD_TOKEN, process.env.CLIENT_ID, process.env.GUILD_ID || null);
  }
  servicesLoaded = true;
}

async function bootstrap() {
  client.bootstrapState.state = 'checking';
  client.bootstrapState.nextRetryAt = null;

  // Configuration/database failures are recoverable. Keep HTTP online and retry
  // with bounded exponential backoff instead of requiring a process restart
  // after a temporary Supabase outage.
  if (!(await runDiagnostics(db))) {
    logger.error('Startup diagnostics failed. Dashboard remains online; bot connection is paused until configuration is fixed.');
    scheduleRetry('Startup diagnostics failed');
    return;
  }

  await loadServicesOnce();
  if (client.isReady()) {
    client.bootstrapState.state = 'ready';
    client.bootstrapState.lastError = null;
    client.bootstrapState.attempt = 0;
    return;
  }

  client.bootstrapState.state = 'connecting';
  try {
    await client.login(process.env.DISCORD_TOKEN);
    client.bootstrapState.state = 'ready';
    client.bootstrapState.lastError = null;
    client.bootstrapState.nextRetryAt = null;
    client.bootstrapState.attempt = 0;
  } catch (err) {
    const message = err?.message || String(err);
    client.bootstrapState.state = 'failed';
    client.bootstrapState.lastError = /token|secret|password/i.test(message)
      ? 'Discord credentials were rejected'
      : 'Discord connection failed';
    logger.error('Discord login failed. Dashboard remains online.', { error: message });
    // Invalid credentials require operator action and should not hammer Discord.
    if (!/token|invalid/i.test(message)) scheduleRetry('Discord connection failed');
  }
}

bootstrap().catch((err) => {
  logger.error('Initial bot bootstrap failed', { error: err?.message || String(err) });
  scheduleRetry('Unexpected bootstrap failure');
});
/* eslint-enable require-atomic-updates */

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  client.bootstrapState.state = 'shutting-down';
  logger.info(`Received ${signal}; shutting down gracefully`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  if (retryTimer) clearTimeout(retryTimer);
  scheduler.removeAll();
  try { await Promise.resolve(client.destroy()); } catch (err) {
    logger.warn('Discord client shutdown failed', { error: err?.message || String(err) });
  }
  try { await stopDashboard(); } catch (err) {
    logger.warn('HTTP shutdown failed', { error: err?.message || String(err) });
  }
  try { await closePool(); } catch (err) {
    logger.warn('PostgreSQL pool shutdown failed', { error: err?.message || String(err) });
  }
  clearTimeout(forceExit);
  await logger.close();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
