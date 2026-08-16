const clients = new Set();
const guildThrottle = new Map();
const THROTTLE_MS = 2000;

function addClient(res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    clients.add(res);
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
    for (const res of clients) {
        send(res, event, payload);
    }
}

function clientCount() { return clients.size; }

setInterval(() => {
    const now = Date.now();
    for (const [guildId, ts] of guildThrottle.entries()) {
        if (now - ts > 60000) guildThrottle.delete(guildId);
    }
}, 60000);

module.exports = { addClient, broadcast, clientCount, send };
