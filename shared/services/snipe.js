const deletes = new Map();
const edits = new Map();
const MAX_AGE = 30 * 60 * 1000;

function prune(map) {
    const now = Date.now();
    for (const [key, value] of map.entries()) {
        if (now - value.ts > MAX_AGE) map.delete(key);
    }
}

function setDelete(channelId, data) {
    deletes.set(channelId, { ...data, ts: Date.now() });
    if (deletes.size > 500) prune(deletes);
}

function getDelete(channelId) {
    const entry = deletes.get(channelId);
    if (!entry || Date.now() - entry.ts > MAX_AGE) {
        deletes.delete(channelId);
        return null;
    }
    return entry;
}

function setEdit(channelId, data) {
    edits.set(channelId, { ...data, ts: Date.now() });
    if (edits.size > 500) prune(edits);
}

function getEdit(channelId) {
    const entry = edits.get(channelId);
    if (!entry || Date.now() - entry.ts > MAX_AGE) {
        edits.delete(channelId);
        return null;
    }
    return entry;
}

module.exports = { setDelete, getDelete, setEdit, getEdit };
