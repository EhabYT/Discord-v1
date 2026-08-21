const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, databaseConfigIssue } = require('../../../database/index');
const { config: botConfig } = require('../../../shared/config/bot-config');

const RELEASE = '2.0.0';
const DASHBOARD_INDEX = path.join(__dirname, '..', '..', '..', 'dashboard', 'public', 'index.html');

async function systemSnapshot(botClient) {
    let databaseOnline = false;
    let databaseError = databaseConfigIssue();
    if (!databaseError) {
        try {
            databaseOnline = !!(await db.ready());
        } catch {
            databaseError = 'Database connection failed';
        }
    }
    const dashboardBuilt = fs.existsSync(DASHBOARD_INDEX);
    const botOnline = !!botClient?.user?.id && botClient.isReady?.() !== false;
    const discordConfigured = /^\d{17,20}$/.test(String(process.env.CLIENT_ID || ''))
        && !!process.env.DISCORD_TOKEN;
    const oauthConfigured = discordConfigured && !!process.env.DISCORD_CLIENT_SECRET;
    const ready = dashboardBuilt && databaseOnline && discordConfigured && botOnline;
    return {
        release: RELEASE,
        apiVersion: 'v2',
        configuration: {
            schemaVersion: botConfig.schemaVersion,
            botName: botConfig.identity.name,
            product: botConfig.identity.product,
            version: botConfig.identity.version,
        },
        status: ready ? 'ready' : 'degraded',
        checks: {
            dashboardBuilt,
            databaseOnline,
            discordConfigured,
            oauthConfigured,
            botOnline,
        },
        databaseError: databaseOnline ? null : databaseError,
        botBootstrap: {
            state: botClient?.bootstrapState?.state || (botOnline ? 'ready' : 'unknown'),
            attempt: botClient?.bootstrapState?.attempt || 0,
            nextRetryAt: botClient?.bootstrapState?.nextRetryAt || null,
            lastError: botClient?.bootstrapState?.lastError || null,
        },
        capabilities: {
            bilingual: ['en', 'ar'],
            rtl: true,
            oauth: true,
            realtime: ['socket.io', 'sse'],
            storage: 'supabase-postgresql',
        },
        timestamp: Date.now(),
    };
}

module.exports = (botClient) => {
    const router = express.Router();
    router.get('/status', async (_req, res, next) => {
        try { return res.json(await systemSnapshot(botClient)); }
        catch (err) { return next(err); }
    });
    router.get('/ready', async (_req, res, next) => {
        try {
            const snapshot = await systemSnapshot(botClient);
            return res.status(snapshot.status === 'ready' ? 200 : 503).json(snapshot);
        } catch (err) { return next(err); }
    });
    return router;
};

module.exports.systemSnapshot = systemSnapshot;
module.exports.RELEASE = RELEASE;
