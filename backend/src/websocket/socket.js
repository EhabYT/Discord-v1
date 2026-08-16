let io = null;

/**
 * Realtime log stream.
 *
 * Previously this accepted ANY connection from ANY origin and let it
 * `join:guild` on any snowflake — anonymous clients received live message
 * content, joins/leaves and moderation events for every guild the bot serves.
 *
 * Now the Express session is shared into Socket.IO, connections without a
 * logged-in user are rejected, and room membership is checked against the
 * guilds that user actually belongs to.
 */
function setupSocket(httpServer, sessionMiddleware, botClient) {
    const { Server } = require('socket.io');
    const { allowAnonymous } = require('../middleware/auth');

    // Reflecting arbitrary origins (`origin: true`) with credentials allows any
    // site to open an authenticated socket. Pin to the configured dashboard URL.
    const origin = process.env.DASHBOARD_URL
        ? [process.env.DASHBOARD_URL]
        : [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

    io = new Server(httpServer, {
        cors: { origin, methods: ['GET', 'POST'], credentials: true },
        transports: ['websocket', 'polling'],
    });

    // Reuse the Express session so socket auth matches HTTP auth.
    if (sessionMiddleware) {
        io.engine.use(sessionMiddleware);
    }

    io.use((socket, next) => {
        const req = socket.request;
        const userId = req?.session?.user?.id || null;
        if (userId) {
            socket.data.userId = userId;
            socket.data.userGuilds = req.session.userGuilds || [];
            return next();
        }
        if (allowAnonymous(req)) {
            socket.data.userId = null;
            socket.data.anonymousLocal = true;
            return next();
        }
        return next(new Error('Not authenticated'));
    });

    io.on('connection', (socket) => {
        socket.on('join:guild', async (guildId) => {
            if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) return;

            if (!socket.data.anonymousLocal) {
                const listed = Array.isArray(socket.data.userGuilds)
                    && socket.data.userGuilds.some((g) => String(g.id) === guildId);
                if (!listed) {
                    // Fall back to the gateway cache when the OAuth list is stale.
                    const guild = botClient?.guilds?.cache?.get(guildId);
                    const member = guild
                        ? await guild.members.fetch(socket.data.userId).catch(() => null)
                        : null;
                    if (!member) return; // silently refuse — not a member
                }
            }
            socket.join(`guild:${guildId}`);
        });

        socket.on('leave:guild', (guildId) => {
            if (typeof guildId !== 'string') return;
            socket.leave(`guild:${guildId}`);
        });
    });

    return io;
}

function emitLog(guildId, event) {
    if (io) {
        io.to(`guild:${guildId}`).emit('log:event', {
            ...event,
            timestamp: Date.now()
        });
    }
}

module.exports = { setupSocket, emitLog };
