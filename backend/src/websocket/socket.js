'use strict';

const { Server } = require('socket.io');
const { localBypassEnabled } = require('../middleware/auth');

let io = null;

function setupSocket(httpServer, sessionMiddleware, botClient) {
    if (io) return io;
    const allowedOrigin = process.env.DASHBOARD_URL || process.env.DASHBOARD_ORIGIN;
    io = new Server(httpServer, {
        cors: allowedOrigin
            ? { origin: allowedOrigin, methods: ['GET', 'POST'], credentials: true }
            : undefined,
        transports: ['websocket', 'polling'],
    });

    if (sessionMiddleware) {
        io.engine.use(sessionMiddleware);
    }

    io.use((socket, next) => {
        const req = socket.request;
        if (req.session?.user?.id || localBypassEnabled(req)) return next();
        return next(new Error('Not authenticated'));
    });

    io.on('connection', (socket) => {
        socket.on('join:guild', async (guildId) => {
            if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) return;
            const guild = botClient?.guilds?.cache?.get(guildId);
            if (!guild) return;
            const userId = socket.request.session?.user?.id;
            if (userId) {
                const oauthGuilds = socket.request.session?.userGuilds;
                if (Array.isArray(oauthGuilds) && !oauthGuilds.some((item) => item.id === guildId)) return;
                if (!Array.isArray(oauthGuilds)) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) return;
                }
            }
            socket.join(`guild:${guildId}`);
        });
        socket.on('leave:guild', (guildId) => {
            if (typeof guildId === 'string') socket.leave(`guild:${guildId}`);
        });
    });

    return io;
}

function emitLog(guildId, event) {
    if (io) {
        io.to(`guild:${guildId}`).emit('log:event', { ...event, timestamp: Date.now() });
    }
}

module.exports = { setupSocket, emitLog };
