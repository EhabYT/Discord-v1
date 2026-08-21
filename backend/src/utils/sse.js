// Response -> authorised guild id. Keeping the scope server-side prevents an
// authenticated member of one guild receiving another guild's message/event
// stream and merely hiding it in the browser.
const clients = new Map();
const guildThrottle = new Map();
const THROTTLE_MS = 2000;

function addClient(res, guildId) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    clients.set(res, String(guildId));
    return () => clients.delete(res);
}

function send(res, event, data) {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
}

function broadcast(event, data) {
    const { guildId } = data;

    if (guildId) {
        const now = Date.now();
        const last = guildThrottle.get(guildId) || 0;
        if (now - last < THROTTLE_MS && event !== 'stats_update') return;
        guildThrottle.set(guildId, now);
    }

    const payload = { ...data, ts: Date.now() };
    for (const [res, authorisedGuildId] of clients) {
        if (guildId && String(guildId) !== authorisedGuildId) continue;
        send(res, event, payload);
    }
}

function clientCount() { return clients.size; }

function closeAll() {
    for (const res of clients.keys()) {
        try { res.end(); } catch { /* connection already closed */ }
    }
    clients.clear();
    guildThrottle.clear();
}

const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [guildId, ts] of guildThrottle.entries()) {
        if (now - ts > 60000) guildThrottle.delete(guildId);
    }
}, 60000);
cleanupTimer.unref();

module.exports = { addClient, broadcast, clientCount, send, closeAll };
