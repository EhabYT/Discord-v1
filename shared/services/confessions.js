const { EmbedBuilder } = require('discord.js');

function nid() {
    return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4);
}

function defaults(cfg = {}) {
    const mins = Number(cfg.cooldownMinutes);
    return {
        channelId: cfg.channelId || null,
        enabled: cfg.enabled !== false,
        cooldownMinutes: Number.isFinite(mins) && mins >= 0 ? Math.min(1440, mins) : 10,
        staffLog: !!cfg.staffLog,
        title: (cfg.title || 'Anonymous Confession').slice(0, 80),
        color: /^#[0-9a-f]{6}$/i.test(cfg.color || '') ? cfg.color : '#9B59B6',
    };
}

function embed(cfg, message) {
    return new EmbedBuilder()
        .setColor(cfg.color || '#9B59B6')
        .setTitle(cfg.title || 'Anonymous Confession')
        .setDescription(message)
        .setFooter({ text: 'The author of this confession is not displayed.' })
        .setTimestamp();
}

async function getConfig(db, guildId) {
    return defaults(await db.get(`confession_config_${guildId}`) || {});
}

async function saveConfig(db, guildId, cfg) {
    const next = defaults(cfg);
    await db.set(`confession_config_${guildId}`, next);
    return next;
}

async function list(db, guildId) {
    return (await db.get(`confessions_${guildId}`)) || [];
}

async function saveList(db, guildId, items) {
    await db.set(`confessions_${guildId}`, items.slice(-150));
    return items;
}

async function checkCooldown(db, guildId, userId, minutes) {
    if (!userId || !minutes) return 0;
    const last = await db.get(`confession_cooldown_${guildId}_${userId}`);
    if (!last) return 0;
    return Math.max(0, minutes * 60 * 1000 - (Date.now() - last));
}

async function create(guild, db, payload = {}) {
    const cfg = await getConfig(db, guild.id);
    if (!cfg.enabled) throw new Error('Confessions are disabled');
    const message = String(payload.message || '').trim().slice(0, 1500);
    if (!message) throw new Error('Confession cannot be empty');
    const channelId = payload.channelId || cfg.channelId;
    const channel = channelId ? guild.channels.cache.get(channelId) : null;
    if (!channel) throw new Error('Set a confession channel first');

    if (payload.authorId && !payload.skipCooldown) {
        const remaining = await checkCooldown(db, guild.id, payload.authorId, cfg.cooldownMinutes);
        if (remaining > 0) {
            const err = new Error(`Please wait ${Math.ceil(remaining / 60000)} more minute(s) before confessing again.`);
            err.code = 'COOLDOWN';
            throw err;
        }
    }

    const posted = await channel.send({ embeds: [embed(cfg, message)], allowedMentions: { parse: [] } });
    const entry = {
        id: nid(),
        message,
        channelId: channel.id,
        messageId: posted.id,
        createdAt: Date.now(),
        authorId: cfg.staffLog ? (payload.authorId || null) : null,
        authorTag: cfg.staffLog ? (payload.authorTag || null) : null,
    };
    const items = await list(db, guild.id);
    items.push(entry);
    await saveList(db, guild.id, items);
    if (payload.authorId) await db.set(`confession_cooldown_${guild.id}_${payload.authorId}`, Date.now());
    return entry;
}

async function remove(guild, db, id) {
    const items = await list(db, guild.id);
    const entry = items.find((x) => x.id === id);
    if (!entry) throw new Error('Confession not found');
    await saveList(db, guild.id, items.filter((x) => x.id !== id));
    const channel = entry.channelId ? await guild.channels.fetch(entry.channelId).catch(() => null) : null;
    const msg = channel && entry.messageId ? await channel.messages.fetch(entry.messageId).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
    return { success: true };
}

module.exports = { nid, defaults, embed, getConfig, saveConfig, list, create, remove, checkCooldown };
