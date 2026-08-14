const express = require('express');
const http = require('http');
const session = require('express-session');
const path = require('path');
const compression = require('compression');
const logger = require('../utils_logger');
const { setupSocket } = require('./socket');
const { addClient, broadcast, clientCount, send } = require('./utils/sse');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.DASHBOARD_PORT || 5000;

const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 400;

function rateLimiter(req, res, next) {
    if (req.path === '/api/health' || req.path === '/api/auth/status') return next();
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress);
    const now = Date.now();
    const limit = rateLimits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    if (now > limit.resetAt) { limit.count = 1; limit.resetAt = now + RATE_LIMIT_WINDOW; }
    else { limit.count++; }
    rateLimits.set(ip, limit);
    if (limit.count > RATE_LIMIT_MAX) return res.status(429).json({ error: 'Slow down' });
    next();
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, limit] of rateLimits.entries()) {
        if (now > limit.resetAt + (30 * 60 * 1000)) rateLimits.delete(ip);
    }
}, 15 * 60 * 1000);

app.disable('x-powered-by');
app.set('trust proxy', 1);

const crypto = require('crypto');
const sessionSecret = process.env.SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET && !process.env.DISCORD_CLIENT_SECRET) {
    logger.warn('SESSION_SECRET is not set — using a random secret for this process only');
}

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.DASHBOARD_SECURE === 'true' ? true : 'auto',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400000
    }
}));

app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    etag: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));
app.use(express.json());
app.use(rateLimiter);

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
});

function startDashboard(botClient) {
    setupSocket(httpServer);

    const authRouter = require('./routes/auth')(botClient);
    const statsRouter = require('./routes/stats')(botClient);
    const guildsRouter = require('./routes/guilds')(botClient);
    const musicRouter = require('./routes/music')(botClient);
    const permissionsRouter = require('./routes/permissions')(botClient);
    const devRouter = require('./routes/dev')(botClient);

    app.use('/api/stats', statsRouter);
    app.use('/api/auth', authRouter);
    app.use('/api/dev', devRouter);
    app.use('/api/guild/:guildId/permissions', permissionsRouter);
    app.use('/api/guild/:guildId', guildsRouter);
    app.use('/api/music/:guildId', musicRouter);

    app.get('/api/guilds', (req, res) => {
        if (!botClient || !botClient.user) return res.status(503).json({ error: 'Bot is initializing' });
        let cache = [...botClient.guilds.cache.values()];
        if (req.session?.userGuilds?.length) {
            const allowed = new Set(req.session.userGuilds.map(g => g.id));
            cache = cache.filter(g => allowed.has(g.id));
        }
        res.json(cache.map(g => ({
            id: g.id,
            name: g.name,
            icon: g.iconURL({ size: 128 }),
            memberCount: g.memberCount
        })));
    });

    app.get('/api/me', (req, res) => {
        if (req.session.user) return res.json(req.session.user);
        if (!botClient || !botClient.user) return res.json({ username: 'Not Connected', avatar: null });
        const app_ = botClient.application;
        const owner = app_?.owner?.user || botClient.user;
        res.json({
            username: owner.username,
            tag: owner.tag || owner.username || 'Bot Admin',
            avatar: owner.displayAvatarURL ? owner.displayAvatarURL({ size: 128 }) : null,
            loggedIn: false
        });
    });

    app.get('/api/bot/presence', (req, res) => {
        if (!botClient || !botClient.user) return res.status(503).json({ error: 'Bot is initializing' });
        const presence = botClient.user.presence;
        const act = presence?.activities?.[0];
        res.json({
            status: presence?.status || 'online',
            activityType: act?.type ?? 0,
            activityText: act?.name || '',
            activities: presence?.activities?.map(a => ({ type: a.type, name: a.name })) || [],
            ping: botClient.ws?.ping ?? 0,
            guildCount: botClient.guilds?.cache?.size ?? 0,
            username: botClient.user.username,
            tag: botClient.user.tag
        });
    });

    app.post('/api/bot/presence', async (req, res) => {
        if (process.env.DASHBOARD_AUTH === 'true' && !req.session?.user?.id) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (!botClient || !botClient.user) return res.status(503).json({ error: 'Bot is initializing' });
        const { status, activityType, activityText } = req.body;
        try {
            botClient.user.setPresence({
                status: status || 'online',
                activities: activityText ? [{ name: activityText, type: parseInt(activityType) || 0 }] : []
            });
            try {
                const { db } = require('../utils/db_wrapper');
                await db.set('bot_presence', {
                    status: status || 'online',
                    activityType: parseInt(activityType) || 0,
                    activityText: activityText || '',
                });
            } catch { /* ignore persist errors */ }
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/events/stream', (req, res) => {
        if (process.env.DASHBOARD_AUTH === 'true' && !req.session?.user?.id) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const remove = addClient(res);
        const a = (() => { try { return require('../utils/analytics'); } catch(e) { return null; } })();
        send(res, 'connected', { totalCommands: a ? a.getGlobalTotal() : 0 });
        const hb = setInterval(() => {
            try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(hb); remove(); }
        }, 20000);
        req.on('close', () => { clearInterval(hb); remove(); });
    });

    app.get('/api/health', async (req, res) => {
        let publicUrl = null;
        try { publicUrl = require('../utils/public_url').readPublicUrl(); } catch { /* ignore */ }
        let maintenance = false;
        try {
            const { db } = require('../utils/db_wrapper');
            const flags = await db.get('dev_flags');
            maintenance = !!flags?.maintenance;
        } catch { /* ignore */ }
        res.json({
            ok: true,
            uptime: botClient?.uptime ? botClient.uptime / 1000 : process.uptime(),
            botOnline: !!botClient?.user,
            guilds: botClient?.guilds?.cache?.size ?? 0,
            sseClients: clientCount(),
            publicUrl,
            maintenance,
            ts: Date.now()
        });
    });

    if (botClient) {
        const a = (() => { try { return require('../utils/analytics'); } catch(e) { return null; } })();

        botClient.on('messageCreate', (msg) => {
            if (msg.author?.bot || !msg.guild) return;
            broadcast('message', {
                guildId: msg.guild.id,
                guildName: msg.guild.name,
                user: msg.author.username,
                avatar: msg.author.displayAvatarURL({ size: 32 }),
                channel: msg.channel?.name,
                description: msg.content?.slice(0, 100) || '[attachment]',
            });
        });

        botClient.on('guildMemberAdd', (member) => {
            broadcast('member_join', {
                guildId: member.guild.id,
                guildName: member.guild.name,
                user: member.user.username,
                avatar: member.user.displayAvatarURL({ size: 32 }),
                description: `Joined the server`,
            });
        });

        botClient.on('guildMemberRemove', (member) => {
            broadcast('member_leave', {
                guildId: member.guild.id,
                guildName: member.guild.name,
                user: member.user?.username || 'Unknown',
                avatar: member.user?.displayAvatarURL({ size: 32 }) || null,
                description: `Left the server`,
            });
        });

        botClient.on('interactionCreate', (interaction) => {
            if (!interaction.isChatInputCommand() || !interaction.guild) return;
            const total = a ? a.getGlobalTotal() : 0;
            broadcast('command', {
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                user: interaction.user.username,
                avatar: interaction.user.displayAvatarURL({ size: 32 }),
                description: `/${interaction.commandName}`,
            });
            broadcast('stats_update', { guildId: interaction.guild.id, totalCommands: total });
        });

        botClient.on('guildBanAdd', (ban) => {
            broadcast('ban', {
                guildId: ban.guild.id,
                guildName: ban.guild.name,
                user: ban.user.username,
                avatar: ban.user.displayAvatarURL({ size: 32 }),
                description: ban.reason || 'No reason provided',
            });
        });

        botClient.on('guildBanRemove', (ban) => {
            broadcast('unban', {
                guildId: ban.guild.id,
                guildName: ban.guild.name,
                user: ban.user.username,
                avatar: ban.user.displayAvatarURL({ size: 32 }),
                description: 'Unbanned',
            });
        });

        botClient.on('messageDelete', (msg) => {
            if (msg.author?.bot || !msg.guild) return;
            broadcast('message_delete', {
                guildId: msg.guild.id,
                guildName: msg.guild.name,
                user: msg.author?.username || 'Unknown',
                avatar: msg.author?.displayAvatarURL({ size: 32 }) || null,
                description: msg.content?.slice(0, 100) || '[attachment]',
                channel: msg.channel?.name,
            });
        });

        botClient.on('voiceStateUpdate', (oldState, newState) => {
            const user = newState.member?.user || oldState.member?.user;
            if (!user || user.bot) return;
            const guild = newState.guild || oldState.guild;
            if (oldState.channelId === null && newState.channelId !== null) {
                broadcast('voice_join', {
                    guildId: guild.id,
                    guildName: guild.name,
                    user: user.username,
                    avatar: user.displayAvatarURL({ size: 32 }),
                    description: newState.channel?.name || 'Voice channel',
                });
            } else if (newState.channelId === null && oldState.channelId !== null) {
                broadcast('voice_leave', {
                    guildId: guild.id,
                    guildName: guild.name,
                    user: user.username,
                    avatar: user.displayAvatarURL({ size: 32 }),
                    description: oldState.channel?.name || 'Voice channel',
                });
            }
        });
    }

    app.get('/api/analytics/global', (req, res) => {
        try {
            const a = (() => { try { return require('../utils/analytics'); } catch(e) { return null; } })();
            res.json({ totalCommands: a ? a.getGlobalTotal() : 0 });
        } catch(err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/performance', (req, res) => {
        const os = require('os');
        const cpus = os.cpus();
        const load = os.loadavg()[0];
        const mem = process.memoryUsage();
        const totalMem = os.totalmem();
        res.json({
            ping: botClient?.ws?.ping || 0,
            uptime: botClient?.uptime || 0,
            cpu: Math.min(100, Math.round((load / cpus.length) * 100)),
            memory: {
                used: mem.heapUsed,
                total: mem.heapTotal,
                rss: mem.rss,
                percent: Math.round((mem.heapUsed / mem.heapTotal) * 100)
            },
            system: {
                freeMem: os.freemem(),
                totalMem,
                memPercent: Math.round(((totalMem - os.freemem()) / totalMem) * 100),
                platform: os.platform(),
                cpuCount: cpus.length
            }
        });
    });

    app.use('/api', (req, res) => {
        res.status(404).json({ error: `Unknown API route ${req.method} ${req.originalUrl}` });
    });

    app.get('/{*path}', (req, res, next) => {
        if (path.extname(req.path)) return next();
        if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            logger.error(`Dashboard port ${PORT} is already in use — bot will keep running without a second dashboard`);
            return;
        }
        logger.error('Dashboard server error', { error: err.message });
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
        logger.info(`✨ Dashboard active at http://0.0.0.0:${PORT}`);
    });
}

module.exports = { startDashboard };
