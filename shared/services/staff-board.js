const { EmbedBuilder } = require('discord.js');
const { parseTimeString } = require('../utils/discord');

function nid() {
    return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4);
}

async function listAnnouncements(db, guildId) {
    return (await db.get(`announcements_${guildId}`)) || [];
}

async function postAnnouncement(guild, db, payload = {}) {
    const channel = guild.channels.cache.get(payload.channelId);
    if (!channel) throw new Error('Channel not found');
    const text = String(payload.message || '').trim().slice(0, 2000);
    if (!text) throw new Error('Message required');
    const title = String(payload.title || 'Announcement').trim().slice(0, 80) || 'Announcement';
    const color = /^#[0-9a-f]{6}$/i.test(payload.color || '') ? payload.color : '#00fbff';
    const ping = !!payload.ping;
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title.startsWith('📢') ? title : `📢 ${title}`)
        .setDescription(text)
        .setFooter({ text: `From ${payload.authorTag || 'Dashboard'}` })
        .setTimestamp();
    const posted = await channel.send({
        content: ping ? '@everyone' : undefined,
        embeds: [embed],
        allowedMentions: ping ? { parse: ['everyone'] } : { parse: [] },
    });
    const entry = {
        id: nid(),
        title,
        message: text,
        channelId: channel.id,
        messageId: posted.id,
        ping,
        color,
        authorTag: payload.authorTag || 'Dashboard',
        createdAt: Date.now(),
    };
    const list = await listAnnouncements(db, guild.id);
    list.push(entry);
    await db.set(`announcements_${guild.id}`, list.slice(-40));
    return entry;
}

async function deleteAnnouncement(guild, db, id) {
    const list = await listAnnouncements(db, guild.id);
    const entry = list.find((x) => x.id === id);
    if (!entry) throw new Error('Announcement not found');
    await db.set(`announcements_${guild.id}`, list.filter((x) => x.id !== id));
    const channel = entry.channelId ? await guild.channels.fetch(entry.channelId).catch(() => null) : null;
    const msg = channel && entry.messageId ? await channel.messages.fetch(entry.messageId).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
    return { success: true };
}

async function listAfk(guild, db) {
    const all = await db.all();
    const prefix = `afk_${guild.id}_`;
    const items = [];
    for (const e of all.filter((x) => x.id.startsWith(prefix) && x.value)) {
        const userId = e.id.slice(prefix.length);
        const member = guild.members.cache.get(userId);
        items.push({
            userId,
            username: member?.user?.username || userId,
            avatar: member?.user?.displayAvatarURL?.({ size: 64 }) || null,
            reason: e.value.reason || 'AFK',
            since: e.value.since || 0,
        });
    }
    items.sort((a, b) => (b.since || 0) - (a.since || 0));
    return items;
}

async function clearAfk(db, guildId, userId) {
    const key = `afk_${guildId}_${userId}`;
    try { await db.delete(key); } catch { await db.set(key, null); }
    return { success: true };
}

async function listReminders(guild, db) {
    const all = await db.all();
    const items = [];
    for (const e of all.filter((x) => x.id.startsWith('reminders_'))) {
        const userId = e.id.replace('reminders_', '');
        const list = Array.isArray(e.value) ? e.value : [];
        list.forEach((r, index) => {
            if (!r || !r.channelId) return;
            if (!guild.channels.cache.has(r.channelId)) return;
            items.push({
                userId,
                index,
                reason: r.reason || '',
                channelId: r.channelId,
                expiresAt: r.expiresAt || 0,
            });
        });
    }
    items.sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
    return items;
}

async function addReminder(guild, db, payload = {}) {
    const channel = guild.channels.cache.get(payload.channelId);
    if (!channel) throw new Error('Channel not found');
    const reason = String(payload.reason || '').trim().slice(0, 300);
    if (!reason) throw new Error('Reason required');
    let duration = Number(payload.durationMs) || 0;
    if (!duration && payload.time) duration = parseTimeString(payload.time) || 0;
    if (!duration || duration < 30000) throw new Error('Time must be at least 30s (e.g. 10m, 1h, 1d)');
    if (duration > 30 * 86400000) throw new Error('Max 30 days');
    const userId = payload.userId || 'dashboard';
    const key = `reminders_${userId}`;
    const list = (await db.get(key)) || [];
    const item = { channelId: channel.id, reason, expiresAt: Date.now() + duration, guildId: guild.id };
    list.push(item);
    await db.set(key, list);
    return item;
}

async function cancelReminder(db, userId, index) {
    const key = `reminders_${userId}`;
    const list = (await db.get(key)) || [];
    if (!list[index]) throw new Error('Reminder not found');
    list.splice(index, 1);
    await db.set(key, list);
    return { success: true };
}

module.exports = {
    listAnnouncements,
    postAnnouncement,
    deleteAnnouncement,
    listAfk,
    clearAfk,
    listReminders,
    addReminder,
    cancelReminder,
};
