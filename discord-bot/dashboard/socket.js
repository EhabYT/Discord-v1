let io = null;

function setupSocket(httpServer) {
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        socket.on('join:guild', (guildId) => {
            socket.join(`guild:${guildId}`);
        });
        socket.on('leave:guild', (guildId) => {
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

function getIO() {
    return io;
}

module.exports = { setupSocket, emitLog, getIO };
