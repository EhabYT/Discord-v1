const { EmbedBuilder } = require('discord.js');

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function nid() {
    return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 4);
}

function embed(poll, results) {
    const e = new EmbedBuilder()
        .setColor(poll.closed ? 0x64748b : 0x00ffff)
        .setTitle(poll.closed ? '📊 Poll · closed' : '🗳️ Poll')
        .setDescription(`**${poll.question}**`)
        .setFooter({ text: poll.closed ? `Closed · ${poll.authorTag || 'Staff'}` : `Vote below · ${poll.authorTag || 'Staff'}` })
        .setTimestamp(poll.createdAt || Date.now());
    const opts = poll.options || [];
    if (opts.length) {
        const total = (results || []).reduce((n, r) => n + (r.votes || 0), 0);
        const lines = opts.map((o, i) => {
            const emoji = o.emoji || EMOJIS[i];
            const votes = results ? (results[i]?.votes || 0) : null;
            if (votes == null) return `${emoji} ${o.text}`;
            const pct = total ? Math.round((votes / total) * 100) : 0;
            return `${emoji} ${o.text} — **${votes}** (${pct}%)`;
        });
        e.addFields({ name: results ? `Results · ${total} votes` : 'Options', value: lines.join('\n').slice(0, 1024) });
    }
    if (poll.endsAt && !poll.closed) {
        e.addFields({ name: 'Ends', value: `<t:${Math.round(poll.endsAt / 1000)}:R>`, inline: true });
    }
    return e;
}

async function list(db, guildId) {
    return (await db.get(`polls_${guildId}`)) || [];
}

async function saveList(db, guildId, items) {
    await db.set(`polls_${guildId}`, items.slice(-50));
    return items;
}

async function tally(guild, poll) {
    const channel = poll.channelId ? await guild.channels.fetch(poll.channelId).catch(() => null) : null;
    const msg = channel && poll.messageId ? await channel.messages.fetch(poll.messageId).catch(() => null) : null;
    return (poll.options || []).map((o) => {
        const r = msg?.reactions?.cache?.get(o.emoji);
        const raw = r ? (r.count || 0) : 0;
        return { emoji: o.emoji, text: o.text, votes: Math.max(0, raw - (r?.me ? 1 : 0)) };
    });
}

async function create(guild, db, payload = {}) {
    const channel = guild.channels.cache.get(payload.channelId);
    if (!channel) throw new Error('Channel not found');
    const question = String(payload.question || '').trim().slice(0, 300);
    if (!question) throw new Error('Question required');
    let texts = Array.isArray(payload.options)
        ? payload.options.map((o) => (typeof o === 'string' ? o : o?.text || '').trim()).filter(Boolean).slice(0, 10)
        : [];
    const yesNo = texts.length === 0;
    if (yesNo) texts = ['Yes', 'No'];
    if (texts.length < 2) throw new Error('Need at least 2 options');
    const durationMs = Number(payload.durationMs) || 0;
    const poll = {
        id: nid(),
        question,
        options: texts.map((text, i) => ({
            emoji: yesNo ? (i === 0 ? '✅' : '❌') : EMOJIS[i],
            text: text.slice(0, 80),
        })),
        yesNo,
        channelId: channel.id,
        messageId: null,
        authorId: payload.authorId || 'dashboard',
        authorTag: payload.authorTag || 'Dashboard',
        createdAt: Date.now(),
        endsAt: durationMs >= 60000 ? Date.now() + Math.min(durationMs, 30 * 86400000) : null,
        closed: false,
    };
    const posted = await channel.send({ embeds: [embed(poll)], allowedMentions: { parse: [] } });
    for (const o of poll.options) await posted.react(o.emoji).catch(() => {});
    poll.messageId = posted.id;
    const items = await list(db, guild.id);
    items.push(poll);
    await saveList(db, guild.id, items);
    return poll;
}

async function close(guild, db, id) {
    const items = await list(db, guild.id);
    const poll = items.find((p) => p.id === id);
    if (!poll) throw new Error('Poll not found');
    if (poll.closed) return poll;
    const results = await tally(guild, poll);
    poll.closed = true;
    poll.closedAt = Date.now();
    poll.results = results;
    await saveList(db, guild.id, items);
    const channel = await guild.channels.fetch(poll.channelId).catch(() => null);
    const msg = channel && poll.messageId ? await channel.messages.fetch(poll.messageId).catch(() => null) : null;
    if (msg) await msg.edit({ embeds: [embed(poll, results)] }).catch(() => {});
    return { ...poll, liveResults: results };
}

async function remove(guild, db, id) {
    const items = await list(db, guild.id);
    const poll = items.find((p) => p.id === id);
    if (!poll) throw new Error('Poll not found');
    await saveList(db, guild.id, items.filter((p) => p.id !== id));
    const channel = poll.channelId ? await guild.channels.fetch(poll.channelId).catch(() => null) : null;
    const msg = channel && poll.messageId ? await channel.messages.fetch(poll.messageId).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
    return { success: true };
}

async function closeExpired(guild, db) {
    const now = Date.now();
    const items = await list(db, guild.id);
    let n = 0;
    for (const poll of items) {
        if (!poll.closed && poll.endsAt && poll.endsAt <= now) {
            await close(guild, db, poll.id).catch(() => {});
            n += 1;
        }
    }
    return n;
}

module.exports = { nid, embed, list, saveList, tally, create, close, remove, closeExpired, EMOJIS };
