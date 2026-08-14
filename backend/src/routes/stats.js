const express = require('express');
const router = express.Router();
const os = require('os');

module.exports = (botClient) => {
    router.get('/', (req, res) => {
        try {
            const guilds = botClient ? botClient.guilds.cache.size : 0;
            const users = botClient ? botClient.guilds.cache.reduce((a, g) => a + g.memberCount, 0) : 0;
            const uptime = botClient ? botClient.uptime : 0;
            const commands = botClient ? botClient.commands.size : 0;
            const ping = botClient ? botClient.ws.ping : 0;

            const cpus = os.cpus();
            const load = os.loadavg()[0];
            const cpuPercent = Math.min(100, Math.round((load / cpus.length) * 100));

            res.json({
                guilds, users, uptime, commands, ping,
                cpu: cpuPercent,
                memory: process.memoryUsage(),
                clientId: botClient?.user ? botClient.user.id : null
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
