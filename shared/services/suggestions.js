const { EmbedBuilder } = require('discord.js');

function nid() {
    return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4);
}

function defaults(cfg = {}) {
    return {
        channelId: cfg.channelId || null,
        anonymousDefault: !!cfg.anonymousDefault,
        staffRoleId: cfg.staffRoleId || null,
        autoReact: cfg.autoReact !== false,
    };
}

function embed(s) {
    const colors = { pending: 0x00ffff, approved: 0x2ecc71, denied: 0xe74c3c };
    const e = new EmbedBuilder()
        .setColor(colors[s.status] || colors.pending)
        .setTitle(`Suggestion #${s.id}`)
        .setDescription(s.message)
        .setAuthor(s.anonymous ? { name: 'Anonymous member' } : { name: s.authorTag || 'Member' })
        .setFooter({ text: `${String(s.status || 'pending').toUpperCase()} • React with 👍 or 👎` })
        .setTimestamp(s.createdAt || Date.now());
    if (s.reviewNote) e.addFields({ name: 'Staff note', value: String(s.reviewNote).slice(0, 500) });
    return e;
}

async function list(db, guildId) {
    return (await db.get(`suggestions_${guildId}`)) || [];
}

async function saveList(db, guildId, items) {
    await db.set(`suggestions_${guildId}`, items);
    return items;
}

async function getConfig(db, guildId) {
    return defaults(await db.get(`suggestion_config_${guildId}`) || {});
}

async function saveConfig(db, guildId, cfg) {
    const next = defaults(cfg);
    await db.set(`suggestion_config_${guildId}`, next);
    return next;
}

async function create(guild, db, payload = {}) {
    const cfg = await getConfig(db, guild.id);
    const channelId = payload.channelId || cfg.channelId;
    const channel = channelId ? guild.channels.cache.get(channelId) : null;
    if (!channel) throw new Error('Set a suggestions channel first');
    const message = String(payload.message || '').trim().slice(0, 1500);
    if (!message) throw new Error('Suggestion cannot be empty');
    const suggestion = {
        id: nid(),
        message,
        anonymous: !!payload.anonymous,
        authorId: payload.authorId || 'dashboard',
        authorTag: payload.authorTag || 'Dashboard',
        channelId: channel.id,
        messageId: null,
        status: 'pending',
        createdAt: Date.now(),
        reviewNote: '',
    };
    const posted = await channel.send({ embeds: [embed(suggestion)], allowedMentions: { parse: [] } });
    if (cfg.autoReact !== false) {
        await posted.react('👍').catch(() => {});
        await posted.react('👎').catch(() => {});
    }
    suggestion.messageId = posted.id;
    const items = await list(db, guild.id);
    items.push(suggestion);
    await saveList(db, guild.id, items.slice(-200));
    return suggestion;
}

async function setStatus(guild, db, id, status, extra = {}) {
    if (!['pending', 'approved', 'denied'].includes(status)) throw new Error('Invalid status');
    const items = await list(db, guild.id);
    const s = items.find((x) => x.id === id);
    if (!s) throw new Error('Suggestion not found');
    s.status = status;
    s.reviewedBy = extra.reviewedBy || 'Dashboard';
    s.reviewedAt = Date.now();
    if (typeof extra.note === 'string') s.reviewNote = extra.note.slice(0, 500);
    await saveList(db, guild.id, items);
    const channel = await guild.channels.fetch(s.channelId).catch(() => null);
    const posted = channel && s.messageId ? await channel.messages.fetch(s.messageId).catch(() => null) : null;
    if (posted) await posted.edit({ embeds: [embed(s)] }).catch(() => {});
    return s;
}

async function remove(guild, db, id) {
    const items = await list(db, guild.id);
    const s = items.find((x) => x.id === id);
    if (!s) throw new Error('Suggestion not found');
    await saveList(db, guild.id, items.filter((x) => x.id !== id));
    const channel = s.channelId ? await guild.channels.fetch(s.channelId).catch(() => null) : null;
    const posted = channel && s.messageId ? await channel.messages.fetch(s.messageId).catch(() => null) : null;
    if (posted) await posted.delete().catch(() => {});
    return { success: true };
}

module.exports = { nid, defaults, embed, list, saveList, getConfig, saveConfig, create, setStatus, remove };
