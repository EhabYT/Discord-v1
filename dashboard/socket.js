let io = null;

function setupSocket(httpServer) {
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
        cors: { origin: process.env.DASHBOARD_URL || true, methods: ['GET', 'POST'] },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        socket.on('join:guild', (guildId) => {
            if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) return;
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
