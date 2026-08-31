const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { db } = require('eb-bot-database');
const { readPublicUrl } = require('eb-bot-shared/services/public-url');
const {
    SYSTEM_ROLES, ROLE_NAMES, requireSystemRole, systemRole, baseSystemRole,
    tokenOk, redactEnv, ownerIds,
} = require('../middleware/devauth');
const { isLoopback } = require('../middleware/auth');
const { clientCount } = require('../utils/sse');
const { recordDeveloperAction, readDeveloperAudit } = require('eb-bot-shared/services/developer-audit');
const { metricsSnapshot } = require('../metrics');
const { invalidateMaintenanceCache } = require('../middleware/maintenance');
const { config: botConfig } = require('eb-bot-shared/config/bot-config');
const scheduler = require('eb-bot');
const { systemSnapshot } = require('./v2');

const ROOT = path.join(__dirname, '..', '..', '..');
const LOG_DIR = path.join(ROOT, 'logs');
const ALLOWED_LOGS = new Set([
    'general.log', 'error.log', 'developer-audit.log', 'tunnel-watch.log', 'cloudflared.log', 'dead-hosts.txt',
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
    const supportOnly = requireSystemRole(botClient, SYSTEM_ROLES.SUPPORT);
    const developerOnly = requireSystemRole(botClient, SYSTEM_ROLES.DEVELOPER);
    const superAdminOnly = requireSystemRole(botClient, SYSTEM_ROLES.SUPER_ADMIN);

    router.get('/whoami', (req, res) => {
        const base = baseSystemRole(req, botClient);
        const effective = systemRole(req, botClient);
        res.json({
            unlocked: effective >= SYSTEM_ROLES.SUPPORT,
            loggedIn: !!req.session?.user?.id,
            role: ROLE_NAMES[effective],
            baseRole: ROLE_NAMES[base],
            canUnlock: base >= SYSTEM_ROLES.DEVELOPER
                || (process.env.NODE_ENV !== 'production' && isLoopback(req)),
            tokenConfigured: !!(process.env.DEV_TOKEN && process.env.DEV_TOKEN.length >= 32),
            ownerConfigured: !!process.env.OWNER_ID,
        });
    });

    router.post('/unlock', (req, res) => {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
        if (!rateUnlock(ip)) return res.status(429).json({ error: 'Too many unlock attempts' });
        const base = baseSystemRole(req, botClient);
        const localBootstrap = process.env.NODE_ENV !== 'production' && isLoopback(req);
        if (base < SYSTEM_ROLES.DEVELOPER && !localBootstrap) {
            if (req.session?.user?.id) recordDeveloperAction(req, 'developer.unlock', 'session', 'denied');
            return res.status(403).json({ error: 'Developer identity required', code: 'DEVELOPER_IDENTITY_REQUIRED' });
        }
        if (base !== SYSTEM_ROLES.SUPER_ADMIN && !tokenOk(req.body?.token)) {
            if (req.session?.user?.id) recordDeveloperAction(req, 'developer.unlock', 'session', 'denied');
            return res.status(403).json({ error: 'Invalid developer token' });
        }
        req.session.devUnlocked = true;
        req.systemRole = ROLE_NAMES[base === SYSTEM_ROLES.SUPER_ADMIN ? base : SYSTEM_ROLES.DEVELOPER];
        return req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Could not save developer session' });
            recordDeveloperAction(req, 'developer.unlock', 'session');
            return res.json({ ok: true, role: req.systemRole });
        });
    });

    router.post('/lock', (req, res) => {
        req.systemRole = ROLE_NAMES[systemRole(req, botClient)];
        recordDeveloperAction(req, 'developer.lock', 'session');
        req.session.devUnlocked = false;
        return req.session.save((err) => err
            ? res.status(500).json({ error: 'Could not save developer session' })
            : res.json({ ok: true }));
    });

    router.get('/overview', supportOnly, async (req, res, next) => {
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
                ownerCount: ownerIds(botClient).size,
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

    router.get('/system-status', supportOnly, async (_req, res, next) => {
        try { return res.json(await systemSnapshot(botClient)); }
        catch (err) { return next(err); }
    });

    router.get('/logs', developerOnly, (req, res, next) => {
        const name = String(req.query.file || 'general.log');
        if (!ALLOWED_LOGS.has(name)) return res.status(400).json({ error: 'Unknown log file' });
        const file = path.join(LOG_DIR, name);
        if (!file.startsWith(LOG_DIR)) return res.status(400).json({ error: 'Bad path' });
        const lines = Math.min(400, Math.max(20, parseInt(req.query.lines, 10) || 120));
        try {
            recordDeveloperAction(req, 'logs.read', name, 'success', { lines });
            res.json({ file: name, ...safeStat(file), text: tailFile(file, lines) });
        } catch (err) {
            next(err);
        }
    });

    router.get('/env', developerOnly, (req, res) => {
        recordDeveloperAction(req, 'environment.inspect', 'runtime');
        res.json({ vars: redactEnv() });
    });

    router.get('/config', supportOnly, (_req, res) => {
        res.json({
            schemaVersion: botConfig.schemaVersion,
            identity: botConfig.identity,
            colors: botConfig.colors,
            emojis: botConfig.emojis,
            limits: botConfig.limits,
            automod: {
                profanity: {
                    matchMode: botConfig.automod.profanity.matchMode,
                    normalizeUnicode: botConfig.automod.profanity.normalizeUnicode,
                    normalizeLeetspeak: botConfig.automod.profanity.normalizeLeetspeak,
                    termCount: botConfig.automod.profanity.terms.length,
                },
            },
        });
    });

    router.get('/commands', supportOnly, (req, res) => {
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

    router.get('/db', developerOnly, async (req, res, next) => {
        try {
            const [top, keys] = await Promise.all([db.prefixStats(30), db.keyCount()]);
            recordDeveloperAction(req, 'database.inspect', 'bot_kv', 'success', { keys });
            res.json({
                keys,
                provider: 'supabase-postgresql',
                prefixes: top,
            });
        } catch (err) {
            next(err);
        }
    });

    router.get('/guilds', supportOnly, (req, res) => {
        if (!botClient?.guilds) return res.json({ guilds: [] });
        const guilds = [...botClient.guilds.cache.values()].map((g) => ({
            id: g.id,
            name: g.name,
            members: g.memberCount,
            shard: g.shardId ?? 0,
            channels: g.channels.cache.size,
            roles: g.roles.cache.size,
            joinedAt: g.joinedTimestamp,
        }));
        res.json({ guilds });
    });

    router.get('/flags', supportOnly, async (req, res) => {
        res.json((await db.get('dev_flags')) || { maintenance: false, verbose: false });
    });

    router.post('/flags', superAdminOnly, async (req, res) => {
        const cur = (await db.get('dev_flags')) || { maintenance: false, verbose: false };
        if (typeof req.body.maintenance === 'boolean') cur.maintenance = req.body.maintenance;
        if (typeof req.body.verbose === 'boolean') cur.verbose = req.body.verbose;
        if (typeof req.body.maintenanceMessage === 'string') {
            cur.maintenanceMessage = req.body.maintenanceMessage.trim().slice(0, 300);
        }
        if (req.body.maintenanceUntil === null || req.body.maintenanceUntil === '') {
            cur.maintenanceUntil = null;
        } else if (req.body.maintenanceUntil !== undefined) {
            const until = Number(req.body.maintenanceUntil);
            if (!Number.isFinite(until) || until <= Date.now() || until > Date.now() + 30 * 24 * 60 * 60 * 1000) {
                return res.status(400).json({ error: 'maintenanceUntil must be within the next 30 days' });
            }
            cur.maintenanceUntil = until;
        }
        await db.set('dev_flags', cur);
        invalidateMaintenanceCache();
        recordDeveloperAction(req, 'features.update', 'dev_flags', 'success', cur);
        res.json(cur);
    });

    router.get('/metrics', developerOnly, (_req, res) => {
        res.json(metricsSnapshot());
    });

    router.get('/jobs', developerOnly, (_req, res) => {
        res.json({ jobs: scheduler.listJobs() });
    });

    router.post('/jobs/:name/run', superAdminOnly, async (req, res) => {
        const name = String(req.params.name || '');
        if (!/^[a-z0-9_-]{1,64}$/i.test(name)) return res.status(400).json({ error: 'Invalid job name' });
        const result = await scheduler.runNow(name);
        recordDeveloperAction(req, 'jobs.run', name, result.ok ? 'success' : 'failed', result);
        return res.status(result.ok ? 200 : 409).json(result);
    });

    router.post('/jobs/:name/pause', superAdminOnly, (req, res) => {
        const name = String(req.params.name || '');
        if (!/^[a-z0-9_-]{1,64}$/i.test(name)) return res.status(400).json({ error: 'Invalid job name' });
        const ok = scheduler.pauseJob(name);
        recordDeveloperAction(req, 'jobs.pause', name, ok ? 'success' : 'failed');
        return res.status(ok ? 200 : 404).json({ ok });
    });

    router.post('/jobs/:name/resume', superAdminOnly, (req, res) => {
        const name = String(req.params.name || '');
        if (!/^[a-z0-9_-]{1,64}$/i.test(name)) return res.status(400).json({ error: 'Invalid job name' });
        const ok = scheduler.resumeJob(name);
        recordDeveloperAction(req, 'jobs.resume', name, ok ? 'success' : 'failed');
        return res.status(ok ? 200 : 404).json({ ok });
    });

    router.get('/audit', developerOnly, (req, res) => {
        const events = readDeveloperAudit({
            limit: req.query.limit,
            action: String(req.query.action || '').slice(0, 80),
            result: String(req.query.result || '').slice(0, 30),
        });
        res.json({ events, total: events.length });
    });

    router.post('/deploy-commands', superAdminOnly, async (req, res, next) => {
        try {
            const { deployCommands } = require('eb-bot-shared/services/startup');
            const guildIds = [...(botClient?.guilds?.cache?.keys() || [])];
            await deployCommands(
                process.env.DISCORD_TOKEN,
                process.env.CLIENT_ID,
                process.env.GUILD_ID || guildIds[0] || null,
                guildIds.slice(1),
                false
            );
            recordDeveloperAction(req, 'bot.deploy_commands', 'discord', 'success', { guilds: guildIds.length });
            res.json({ ok: true, guilds: guildIds.length });
        } catch (err) {
            next(err);
        }
    });

    return router;
};
