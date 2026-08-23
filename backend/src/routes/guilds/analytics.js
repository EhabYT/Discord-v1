function loadAnalytics() {
    try {
        return require('../../../../shared/services/analytics');
    } catch {
        return null;
    }
}

function emptyChart() {
    return Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        messages: 0,
        joins: 0,
        commands: 0,
    }));
}

function emptySummary() {
    return {
        messages24h: 0,
        joins24h: 0,
        commands24h: 0,
        onlineCount: 0,
        totalCommands: 0,
    };
}

function registerAnalyticsRoutes(router, analytics = loadAnalytics()) {
    router.get('/analytics/chart', (req, res, next) => {
        try {
            res.json(analytics ? analytics.getChart(req.params.guildId) : emptyChart());
        } catch (err) {
            next(err);
        }
    });

    router.get('/analytics/commands', (req, res, next) => {
        try {
            res.json(analytics
                ? analytics.getCommandUsage(req.params.guildId)
                : { commands: [], total: 0 });
        } catch (err) {
            next(err);
        }
    });

    router.get('/analytics/summary', (req, res, next) => {
        try {
            res.json(analytics
                ? analytics.getSummary(req.params.guildId, req.guild)
                : emptySummary());
        } catch (err) {
            next(err);
        }
    });
}

module.exports = registerAnalyticsRoutes;
