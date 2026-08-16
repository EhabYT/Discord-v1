const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', '.dashboard-url');
const DEAD_FILE = path.join(__dirname, '..', '..', 'logs', 'dead-hosts.txt');

function deadHosts() {
    try {
        return new Set(
            fs.readFileSync(DEAD_FILE, 'utf8')
                .split(/\r?\n/)
                .map((l) => l.trim().toLowerCase())
                .filter((l) => l && !l.startsWith('#'))
        );
    } catch {
        return new Set();
    }
}

function markDead(urlOrHost) {
    let host = String(urlOrHost || '').trim().toLowerCase();
    try { host = new URL(host).hostname.toLowerCase(); } catch { /* already a host */ }
    host = host.replace(/^https?:\/\//, '').split('/')[0];
    if (!host) return;
    const set = deadHosts();
    if (set.has(host)) return;
    try {
        fs.mkdirSync(path.dirname(DEAD_FILE), { recursive: true });
        fs.appendFileSync(DEAD_FILE, `${host}\n`);
    } catch { /* ignore */ }
}

function sanitize(raw) {
    if (!raw) return null;
    try {
        const parsed = new URL(String(raw).trim());
        const host = (parsed.hostname || '').toLowerCase();
        const privateHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || privateHost) return null;
        if (deadHosts().has(host)) return null;
        return parsed.origin;
    } catch {
        return null;
    }
}

function readPublicUrl() {
    try {
        const fromFile = fs.readFileSync(FILE, 'utf8').trim();
        const clean = sanitize(fromFile);
        if (clean) return clean;
    } catch { /* missing */ }
    return sanitize(process.env.DASHBOARD_URL || '');
}

function writePublicUrl(url) {
    const clean = sanitize(url);
    if (!clean) return null;
    fs.writeFileSync(FILE, `${clean}\n`, { mode: 0o600 });
    process.env.DASHBOARD_URL = clean;
    process.env.DISCORD_REDIRECT_URI = `${clean}/api/auth/discord/callback`;
    return clean;
}

module.exports = { readPublicUrl, writePublicUrl, sanitize, markDead, deadHosts, FILE };
