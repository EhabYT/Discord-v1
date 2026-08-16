function normalize(name) {
    return String(name || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

async function mapOf(db, guildId) {
    const raw = (await db.get(`tags_${guildId}`)) || {};
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

async function list(db, guildId) {
    const tags = await mapOf(db, guildId);
    return Object.entries(tags)
        .map(([name, v]) => ({
            name,
            content: v?.content || '',
            author: v?.author || null,
            ts: v?.ts || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function get(db, guildId, name) {
    const tags = await mapOf(db, guildId);
    const key = normalize(name);
    const v = tags[key];
    if (!v) return null;
    return { name: key, content: v.content || '', author: v.author || null, ts: v.ts || 0 };
}

async function upsert(db, guildId, name, content, authorId) {
    const key = normalize(name);
    if (!key) throw new Error('Tag name required');
    const text = String(content || '').trim().slice(0, 1500);
    if (!text) throw new Error('Tag content required');
    const tags = await mapOf(db, guildId);
    tags[key] = { content: text, author: authorId || 'dashboard', ts: Date.now() };
    await db.set(`tags_${guildId}`, tags);
    return { name: key, ...tags[key] };
}

async function remove(db, guildId, name) {
    const key = normalize(name);
    const tags = await mapOf(db, guildId);
    if (!tags[key]) throw new Error('Tag not found');
    delete tags[key];
    await db.set(`tags_${guildId}`, tags);
    return { success: true };
}

module.exports = { normalize, list, get, upsert, remove };
