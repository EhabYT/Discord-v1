const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { db } = require('../../../database/index');
const { readPublicUrl } = require('../../../shared/services/public-url');
const { requireDev, isDev, tokenOk, redactEnv, ownerIds } = require('../middleware/devauth');
const { clientCount } = require('../utils/sse');

const ROOT = path.join(__dirname, '..', '..', '..');
const LOG_DIR = path.join(ROOT, 'logs');
const ALLOWED_LOGS = new Set([
    'general.log', 'error.log', 'tunnel-watch.log', 'cloudflared.log', 'dead-hosts.txt',
]);

const unlockHits = new Map();

function rateUnlock(ip) {
    const now = Date.now();
    const hit = unlockHits.get(ip) || { n: 0, t: now };
    if (now - hit.t > 10 * 60 * 1000) { hit.n = 0; hit.t = now; }
    hit.n += 1;
    unlockHits.set(ip, hit);
    return hit.n <= 8;
}

function tailFile(file, lines = 120) {
    const raw = fs.readFileSync(file, 'utf8');
    const arr = raw.split(/\r?\n/);
    return arr.slice(Math.max(0, arr.length - lines)).join('\n');
}

function safeStat(p) {
    try {
        const s = fs.statSync(p);
        return { exists: true, size: s.size, mtime: s.mtimeMs };
    } catch {
        return { exists: false, size: 0, mtime: null };
    }
}

function procs() {
    const names = [
        { id: 'bot', re: /node index\.js/ },
        { id: 'watchdog', re: /keep-tunnel\.sh/ },
        { id: 'cloudflared', re: /cloudflared tunnel --url/ },
    ];
    let text = '';
    try {
        text = require('child_process').execSync('ps -eo pid,etime,rss,args --no-headers', { encoding: 'utf8', timeout: 3000 });
    } catch {
        return names.map((n) => ({ id: n.id, running: false }));
    }
    return names.map((n) => {
        const line = text.split('\n').find((l) => n.re.test(l) && !l.includes('grep'));
        if (!line) return { id: n.id, running: false };
        const parts = line.trim().split(/\s+/);
        return {
            id: n.id,
            running: true,
            pid: Number(parts[0]),
            etime: parts[1],
            rssKb: Number(parts[2]),
        };
    });
}

module.exports = (botClient) => {
    const router = express.Router();

    router.get('/whoami', (req, res) => {
        res.json({
            unlocked: isDev(req, botClient),
            loggedIn: !!req.session?.user?.id,
            userId: req.session?.user?.id || null,
            tokenConfigured: !!(process.env.DEV_TOKEN && process.env.DEV_TOKEN.length >= 16),
            ownerConfigured: !!(process.env.OWNER_ID),
        });
    });

    router.post('/unlock', (req, res) => {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
        if (!rateUnlock(ip)) return res.status(429).json({ error: 'Too many unlock attempts' });
        const token = req.body?.token;
        if (!tokenOk(token)) return res.status(403).json({ error: 'Invalid developer token' });
        req.session.devUnlocked = true;
        req.session.save(() => res.json({ ok: true }));
    });

    router.post('/lock', (req, res) => {
        req.session.devUnlocked = false;
        req.session.save(() => res.json({ ok: true }));
    });

    router.use(requireDev(botClient));

    router.get('/overview', async (req, res, next) => {
        try {
            const mem = process.memoryUsage();
            const publicUrl = readPublicUrl();
            const dead = (() => {
                try {
                    return fs.readFileSync(path.join(LOG_DIR, 'dead-hosts.txt'), 'utf8')
                        .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
                } catch { return []; }
            })();
            res.json({
                node: process.version,
                pid: process.pid,
                platform: `${os.type()} ${os.release()}`,
                cwd: process.cwd(),
                uptimeSec: Math.round(process.uptime()),
                bot: {
                    online: !!botClient?.user,
                    tag: botClient?.user?.tag || null,
                    id: botClient?.user?.id || null,
                    guilds: botClient?.guilds?.cache?.size ?? 0,
                    ping: botClient?.ws?.ping ?? null,
                    uptimeMs: botClient?.uptime || 0,
                    commands: botClient?.commands?.size ?? 0,
                    readyAt: botClient?.readyTimestamp || null,
                },
                memory: {
                    rss: mem.rss,
                    heapUsed: mem.heapUsed,
                    heapTotal: mem.heapTotal,
                    external: mem.external,
                },
                system: {
                    load: os.loadavg(),
                    freemem: os.freemem(),
                    totalmem: os.totalmem(),
                    cpus: os.cpus().length,
                },
                publicUrl,
                sseClients: clientCount(),
                processes: procs(),
                deadHosts: dead.slice(-40),
                owners: [...ownerIds(botClient)],
                flags: (await db.get('dev_flags')) || { maintenance: false, verbose: false },
                files: {
                    env: safeStat(path.join(ROOT, '.env')),
                    dashboardUrl: safeStat(path.join(ROOT, '.dashboard-url')),
                },
                database: { provider: 'supabase-postgresql', configured: !!process.env.DATABASE_URL },
                ts: Date.now(),
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/logs', (req, res, next) => {
        const name = String(req.query.file || 'general.log');
        if (!ALLOWED_LOGS.has(name)) return res.status(400).json({ error: 'Unknown log file' });
        const file = path.join(LOG_DIR, name);
        if (!file.startsWith(LOG_DIR)) return res.status(400).json({ error: 'Bad path' });
        const lines = Math.min(400, Math.max(20, parseInt(req.query.lines, 10) || 120));
        try {
            res.json({ file: name, ...safeStat(file), text: tailFile(file, lines) });
        } catch (err) {
            next(err);
        }
    });

    router.get('/env', (req, res) => {
        res.json({ vars: redactEnv() });
    });

    router.get('/commands', (req, res) => {
        const list = [];
        if (botClient?.commands) {
            for (const [name, cmd] of botClient.commands) {
                let json = {};
                try { json = cmd.data.toJSON(); } catch { /* ignore */ }
                const opts = json.options || [];
                list.push({
                    name,
                    description: json.description || '',
                    size: JSON.stringify(json).length,
                    subs: opts.filter((o) => o.type === 1).map((o) => o.name),
                    defer: !!cmd.defer,
                });
            }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ total: list.length, overLimit: list.length > 100, commands: list });
    });

    router.get('/db', async (req, res, next) => {
        try {
            const all = await db.all();
            const prefixes = {};
            for (const row of all) {
                const id = String(row.id || '');
                const p = id.split('_')[0] || id;
                prefixes[p] = (prefixes[p] || 0) + 1;
            }
            const top = Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 30)
                .map(([prefix, count]) => ({ prefix, count }));
            res.json({
                keys: all.length,
                provider: 'supabase-postgresql',
                prefixes: top,
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/guilds', (req, res) => {
        if (!botClient?.guilds) return res.json({ guilds: [] });
        const guilds = [...botClient.guilds.cache.values()].map((g) => ({
            id: g.id,
            name: g.name,
            members: g.memberCount,
            ownerId: g.ownerId,
            shard: g.shardId ?? 0,
            channels: g.channels.cache.size,
            roles: g.roles.cache.size,
            joinedAt: g.joinedTimestamp,
        }));
        res.json({ guilds });
    });

    router.get('/flags', async (req, res) => {
        res.json((await db.get('dev_flags')) || { maintenance: false, verbose: false });
    });

    router.post('/flags', async (req, res) => {
        const cur = (await db.get('dev_flags')) || { maintenance: false, verbose: false };
        if (typeof req.body.maintenance === 'boolean') cur.maintenance = req.body.maintenance;
        if (typeof req.body.verbose === 'boolean') cur.verbose = req.body.verbose;
        await db.set('dev_flags', cur);
        res.json(cur);
    });

    router.post('/deploy-commands', async (req, res, next) => {
        try {
            const { deployCommands } = require('../../../shared/services/startup');
            const guildIds = [...(botClient?.guilds?.cache?.keys() || [])];
            await deployCommands(
                process.env.DISCORD_TOKEN,
                process.env.CLIENT_ID,
                process.env.GUILD_ID || guildIds[0] || null,
                guildIds.slice(1),
                false
            );
            res.json({ ok: true, guilds: guildIds.length });
        } catch (err) {
            next(err);
        }
    });

    return router;
};
