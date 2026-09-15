/**
 * Security Monitoring Endpoint
 *
 * Provides a /api/security endpoint for monitoring security status.
 * Only accessible by authenticated users (system owner check done in route).
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { getStats: getIPBlockStats, reset: resetIPBlock } = require('../middleware/ip-block');
const { getStats: getRateLimitStats } = require('../middleware/rate-limit');
const { readSecurityAlerts, getAuditStats } = require('eb-bot-shared/services/developer-audit');

const router = Router();

router.get('/security', requireAuth, (req, res) => {
    const ipBlockStats = getIPBlockStats();
    const rateLimitStats = getRateLimitStats();
    const auditStats = getAuditStats();
    const securityAlerts = readSecurityAlerts({});

    res.json({
        success: true,
        data: {
            ipBlocking: {
                blockedIPs: ipBlockStats.blockedIPs,
                trackedIPs: ipBlockStats.trackedIPs,
            },
            rateLimiting: {
                totalEntries: rateLimitStats.totalEntries,
                perIP: rateLimitStats.perIP,
            },
            audit: {
                queueLength: auditStats?.queueLength || 0,
                recentAlerts: securityAlerts.length,
            },
            timestamp: new Date().toISOString(),
        },
    });
});

router.post('/security/reset-ip-blocks', requireAuth, (req, res) => {
    resetIPBlock();
    res.json({ success: true, message: 'IP blocks reset' });
});

module.exports = router;
