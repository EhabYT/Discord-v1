const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../..', '.env') });
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { Player } = require('discord-player');
const { db, closePool } = require('eb-bot-database');
const { config: botConfig } = require('eb-bot-shared/config/bot-config');

const logger = require('eb-bot-shared/lib/logger');
const scheduler = require('./scheduler.js');
const { loadEvents } = require('./events');
const { loadCommands } = require('./handlers/command-loader');
const { attachClientErrorHandler } = require('./handlers/client-errors');
const { maxRetriesFromEnv, retryDelay } = require('./handlers/bootstrap-retry');
const { registerJobs } = require('eb-bot-shared/services/scheduler-jobs');
const { deployCommands, runDiagnostics } = require('eb-bot-shared/services/startup');
const { startDashboard, stopDashboard } = require('eb-bot-api');

// Initialize Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
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
attachClientErrorHandler(client, logger);

// Attach properties to client
client.commands = new Collection();
client.db = db;
client.helpers = require('eb-bot-shared/utils/discord');
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

// Load commands exactly once at startup. Duplicate names fail fast instead of
// silently replacing a handler and leaving dispatch/deployment inconsistent.
const commandsPath = path.join(__dirname, 'commands');
loadCommands(commandsPath, client.commands, logger);

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
let heartbeatTimer = null;

// Presence heartbeat for client-less API processes: the standalone dashboard
// (`npm run dev:api`, `startDashboard(null)`) has no Discord client, so its
// /api/health can never report botOnline from process state. The logged-in
// process stamps a shared key instead, and readers treat a fresh stamp as
// online. Stale stamps (>75s, bot crashed) read offline again. Never held
// open: unref'd, best-effort, and outside the backup key allowlist.
function startHeartbeat() {
  if (heartbeatTimer) return;
  const beat = () => {
    try {
      const p = db.set('bot_heartbeat', Date.now());
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* ephemeral DB failure must never crash the bot */ }
  };
  beat();
  heartbeatTimer = setInterval(beat, 20_000);
  heartbeatTimer.unref();
}

function scheduleRetry(reason) {
  if (retryTimer || shuttingDown) return;
  const maxRetries = maxRetriesFromEnv(process.env.BOT_BOOTSTRAP_MAX_RETRIES);
  if (client.bootstrapState.attempt >= maxRetries) {
    client.bootstrapState.state = 'failed';
    client.bootstrapState.lastError = reason;
    client.bootstrapState.nextRetryAt = null;
    logger.error('Bot bootstrap retry limit reached; dashboard remains online', {
      attempts: client.bootstrapState.attempt,
      maxRetries,
      reason,
    });
    return;
  }
  client.bootstrapState.attempt += 1;
  const delay = retryDelay(client.bootstrapState.attempt);
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
  // YouTube changes its API responses constantly; youtubei.js JIT-generates
  // missing parser nodes at runtime and reports each one with a wall of
  // text. That noise is harmless (playback is unaffected) so it is dropped
  // to ERROR level BEFORE any extractor boots — the decipher warnings fire
  // during registration itself. Genuine failures still surface as errors
  // and through the extractor/player as thrown errors.
  try {
    const { Parser, Log } = require('youtubei.js');
    if (typeof Parser?.setParserErrorHandler === 'function') Parser.setParserErrorHandler(() => {});
    if (typeof Log?.setLevel === 'function' && Log?.Level) Log.setLevel(Log.Level.ERROR);
  } catch { /* older youtubei.js without the hooks — noise stays, playback works */ }
  try {
    await player.extractors.loadDefault();
    logger.info('Default music extractors loaded');
  } catch (err) {
    logger.error('Extractor error', { error: err.message });
  }
  // YouTube was removed from @discord-player/extractor's defaults. Without
  // this, YouTube URLs fail with "no extractor found" while search (via
  // SoundCloud/Spotify metadata) misleadingly still works.
  try {
    const { YoutubeiExtractor } = require('discord-player-youtubei');
    await player.extractors.register(YoutubeiExtractor, {});
    logger.info('YouTube (InnerTube) extractor registered');
  } catch (err) {
    logger.error('YouTube extractor error', { error: err.message });
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
    startHeartbeat();
    return;
  }

  client.bootstrapState.state = 'connecting';
  try {
    await client.login(process.env.DISCORD_TOKEN);
    client.bootstrapState.state = 'ready';
    client.bootstrapState.lastError = null;
    client.bootstrapState.nextRetryAt = null;
    client.bootstrapState.attempt = 0;
    startHeartbeat();
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
  if (heartbeatTimer) clearInterval(heartbeatTimer);
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
  try {
    require('eb-bot-shared/services/developer-audit').flushDeveloperAudit();
  } catch { /* auditing must never fail shutdown */ }
  clearTimeout(forceExit);
  await logger.close();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
