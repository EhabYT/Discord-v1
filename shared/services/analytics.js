const HOUR_MS = 60 * 60 * 1000;
const HOURS = 24;

const buckets = new Map(); // guildId -> Array(24) { messages, joins, commands }
const commandUsage = new Map(); // guildId -> Map(commandName -> count)
let globalCommands = 0;

function getBuckets(guildId) {
    if (!buckets.has(guildId)) {
        buckets.set(guildId, Array.from({ length: HOURS }, (_, i) => ({
            hour: i,
            ts: Date.now() - (HOURS - 1 - i) * HOUR_MS,
            messages: 0,
            joins: 0,
            commands: 0
        })));
    }
    return buckets.get(guildId);
}

function currentBucketIndex() {
    return new Date().getHours();
}

function trackMessage(guildId) {
    const b = getBuckets(guildId);
    b[currentBucketIndex()].messages++;
}

function trackJoin(guildId) {
    const b = getBuckets(guildId);
    b[currentBucketIndex()].joins++;
}

function trackCommand(guildId, commandName) {
    const b = getBuckets(guildId);
    b[currentBucketIndex()].commands++;
    globalCommands++;

    if (!commandUsage.has(guildId)) commandUsage.set(guildId, new Map());
    const usage = commandUsage.get(guildId);
    usage.set(commandName, (usage.get(commandName) || 0) + 1);
}

function getChart(guildId) {
    return getBuckets(guildId).map(b => ({
        hour: b.hour,
        label: `${String(b.hour).padStart(2, '0')}:00`,
        messages: b.messages,
        joins: b.joins,
        commands: b.commands
    }));
}

function getCommandUsage(guildId) {
    const usage = commandUsage.get(guildId) || new Map();
    const entries = [...usage.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));
    const total = [...usage.values()].reduce((a, b) => a + b, 0);
    return { commands: entries, total };
}

function getSummary(guildId, guild) {
    const b = getBuckets(guildId);
    const messages24h = b.reduce((s, x) => s + x.messages, 0);
    const joins24h = b.reduce((s, x) => s + x.joins, 0);
    const commands24h = b.reduce((s, x) => s + x.commands, 0);
    const onlineCount = guild ? guild.members.cache.filter(m => m.presence?.status !== 'offline' && m.presence?.status).size : 0;
    return { messages24h, joins24h, commands24h, onlineCount, totalCommands: globalCommands };
}

function getGlobalTotal() { return globalCommands; }

// Sweep old data every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const b of buckets.values()) {
        b.forEach(bucket => {
            if (now - bucket.ts > HOURS * HOUR_MS) {
                bucket.messages = 0;
                bucket.joins = 0;
                bucket.commands = 0;
                bucket.ts = now;
            }
        });
    }
}, 30 * 60 * 1000);

module.exports = { trackMessage, trackJoin, trackCommand, getChart, getCommandUsage, getSummary, getGlobalTotal };
