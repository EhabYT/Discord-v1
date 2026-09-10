const { db } = require('eb-bot-database');

// Verification routes extracted from the monolithic guilds router (second
// extraction after the staff board). Registered inline at the exact position
// the routes previously occupied, so Express matching order is unchanged.
// `requirePerm`/`rl`/`hierarchyError` are passed in because they close over
// the live botClient; `db` and the verification service are singletons
// required here directly (Node module cache returns the identical instances).
function registerVerificationRoutes(router, { requirePerm, rl, hierarchyError }) {
    const verify = require('eb-bot-shared/services/verification');

    router.get('/verification', async (req, res, next) => {
        try {
            const config = await verify.getConfig(db, req.params.guildId);
            res.json(config);
        } catch (err) { next(err); }
    });

    router.get('/verification/overview', async (req, res, next) => {
        try {
            res.json(await verify.overview(req.guild, db));
        } catch (err) { next(err); }
    });

    router.get('/verification/pending', async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            res.json(await verify.listPending(req.guild, db, cfg));
        } catch (err) { next(err); }
    });

    router.get('/verification/log', async (req, res, next) => {
        try {
            res.json(await verify.getLog(db, req.params.guildId));
        } catch (err) { next(err); }
    });

    router.post('/verification', requirePerm(3), async (req, res, next) => {
        try {
            const current = await verify.getConfig(db, req.params.guildId);
            const body = req.body || {};
            const merged = { ...current, ...body };
            if (body.logChannelId && !body.channelId && !current.channelId) {
                merged.channelId = body.logChannelId;
            }
            for (const key of ['roleId', 'unverifiedRoleId']) {
                if (merged[key]) {
                    try {
                        verify.assertRoleManageable(req.guild, merged[key]);
                    } catch (err) {
                        const status = err.code === 'NOT_FOUND' ? 400 : 403;
                        return res.status(status).json({ error: err.message, code: err.code || 'HIERARCHY', field: key });
                    }
                }
            }
            for (const id of merged.extraRoleIds || []) {
                if (id && id !== merged.roleId) {
                    try {
                        verify.assertRoleManageable(req.guild, id);
                    } catch (err) {
                        const status = err.code === 'NOT_FOUND' ? 400 : 403;
                        return res.status(status).json({ error: err.message, code: err.code || 'HIERARCHY', field: 'extraRoleIds' });
                    }
                }
            }
            const saved = await verify.saveConfig(db, req.params.guildId, merged);
            res.json(saved);
        } catch (err) { next(err); }
    });

    router.post('/verification/panel', requirePerm(3), rl.botMessaging(), async (req, res, next) => {
        try {
            const current = await verify.getConfig(db, req.params.guildId);
            if (!current.roleId && !req.body.roleId) {
                return res.status(400).json({ error: 'Set a verified role first' });
            }
            const cfg = verify.defaults({
                ...current,
                title: req.body.title ?? current.title,
                description: req.body.description ?? current.description,
                buttonLabel: req.body.buttonLabel ?? current.buttonLabel,
                buttonEmoji: req.body.buttonEmoji ?? current.buttonEmoji,
                buttonStyle: req.body.buttonStyle ?? current.buttonStyle,
                embedColor: req.body.embedColor ?? current.embedColor,
                rulesText: req.body.rulesText ?? current.rulesText,
                requireRules: typeof req.body.requireRules === 'boolean' ? req.body.requireRules : current.requireRules,
                mode: req.body.mode ?? current.mode,
                showGuildIcon: typeof req.body.showGuildIcon === 'boolean' ? req.body.showGuildIcon : current.showGuildIcon,
                panelImage: req.body.panelImage ?? current.panelImage,
                panelThumbnail: req.body.panelThumbnail ?? current.panelThumbnail,
                footerText: req.body.footerText ?? current.footerText,
            });
            const channelId = req.body.channelId || cfg.channelId || cfg.logChannelId;
            try {
                const result = await verify.postPanel(req.guild, cfg, channelId);
                cfg.channelId = result.channelId;
                cfg.messageId = result.messageId;
                cfg.enabled = true;
                await verify.saveConfig(db, req.params.guildId, cfg);
                res.json({ success: true, ...result });
            } catch (err) {
                if (err.code === 'HIERARCHY' || err.code === 'MANAGED_ROLE' || err.code === 'EVERYONE' || err.code === 'NO_PERMS') {
                    return res.status(403).json({ error: err.message, code: err.code });
                }
                throw err;
            }
        } catch (err) { next(err); }
    });

    router.post('/verification/members/:userId/verify', requirePerm(2), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            if (!cfg.roleId) return res.status(400).json({ error: 'Set a verified role first', code: 'NOT_SETUP' });
            const problem = verify.setupProblem ? verify.setupProblem(cfg, req.guild) : null;
            if (problem && problem.code !== 'DISABLED') {
                const status = problem.code === 'NOT_FOUND' ? 400 : 403;
                return res.status(status).json({ error: problem.message, code: problem.code });
            }
            const member = await req.guild.members.fetch(req.params.userId).catch(() => null);
            if (!member) return res.status(404).json({ error: 'Member not found' });
            const actor = req.session?.user?.username || 'Dashboard';
            try {
                const entry = await verify.applyVerification(member, cfg, { db, method: 'staff', actor });
                res.json({ success: true, entry });
            } catch (err) {
                if (err.code === 'HIERARCHY' || err.code === 'MANAGED_ROLE' || err.code === 'EVERYONE' || err.code === 'NO_PERMS') {
                    return res.status(403).json({ error: err.message, code: err.code });
                }
                if (err.code === 'NOT_FOUND') {
                    return res.status(400).json({ error: err.message, code: err.code });
                }
                if (typeof err?.code === 'number' && verify.describeDiscordFailure) {
                    const mapped = verify.describeDiscordFailure(err, req.guild.roles.cache.get(cfg.roleId));
                    const status = mapped.code === 'NOT_FOUND' ? 404 : 403;
                    return res.status(status).json({ error: mapped.message, code: mapped.code });
                }
                throw err;
            }
        } catch (err) { next(err); }
    });

    router.post('/verification/members/:userId/unverify', requirePerm(2), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            const member = await req.guild.members.fetch(req.params.userId).catch(() => null);
            if (!member) return res.status(404).json({ error: 'Member not found' });
            const actor = req.session?.user?.username || 'Dashboard';
            await verify.revokeVerification(member, cfg, { db, actor });
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/verification/kick-pending', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            const map = await verify.getPendingMap(db, req.params.guildId);
            const overdueOnly = req.body?.overdueOnly !== false;
            const now = Date.now();
            // Bulk moderation guard rails. This loop previously ran uncapped over
            // every pending entry, issuing one Discord kick per iteration with no
            // hierarchy check — so an Admin could sweep out moderators, and a large
            // pending list would burn the bot's global rate limit inside a single
            // request. Cap the batch, respect hierarchy, and report what was skipped.
            const MAX_KICKS = 50;
            let kicked = 0;
            let skipped = 0;
            let remaining = 0;
            for (const [userId, info] of Object.entries(map)) {
                if (overdueOnly && info?.kickAt && info.kickAt > now) continue;
                if (overdueOnly && !info?.kickAt) continue;
                if (kicked >= MAX_KICKS) { remaining += 1; continue; }
                const member = await req.guild.members.fetch(userId).catch(() => null);
                if (member && !verify.isVerified(member, cfg) && !verify.hasBypass(member, cfg)) {
                    // Never let a bulk sweep do what a single action would refuse.
                    if (await hierarchyError(req, member)) { skipped += 1; continue; }
                    if (member.kickable === false) { skipped += 1; continue; }
                    const ok = await member.kick(overdueOnly ? 'Did not verify in time' : 'Kicked unverified (dashboard)').catch(() => null);
                    if (ok) kicked += 1;
                }
                delete map[userId];
            }
            await verify.setPendingMap(db, req.params.guildId, map);
            res.json({ success: true, kicked, skipped, remaining });
        } catch (err) { next(err); }
    });

    router.delete('/verification/log', requirePerm(3), async (req, res, next) => {
        try {
            await verify.clearLog(db, req.params.guildId);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/verification/roles', requirePerm(3), async (req, res, next) => {
        try {
            const which = ['verified', 'unverified', 'both'].includes(req.body?.which) ? req.body.which : 'both';
            const created = await verify.createRoles(req.guild, {
                which,
                verifiedName: req.body?.verifiedName,
                unverifiedName: req.body?.unverifiedName,
            });
            const cfg = await verify.getConfig(db, req.params.guildId);
            if (created.verified) cfg.roleId = created.verified.id;
            if (created.unverified) cfg.unverifiedRoleId = created.unverified.id;
            const saved = await verify.saveConfig(db, req.params.guildId, cfg);
            res.json({ success: true, created, config: saved });
        } catch (err) { next(err); }
    });

    router.post('/verification/lock', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const cfg = await verify.getConfig(db, req.params.guildId);
            if (req.body?.channelId) cfg.channelId = req.body.channelId;
            if (req.body?.enable === false) {
                await verify.removeGateLock(req.guild, cfg);
                cfg.lockApplied = false;
                cfg.lockedChannelIds = [];
                const saved = await verify.saveConfig(db, req.params.guildId, cfg);
                return res.json({ success: true, locked: false, config: saved });
            }
            const ids = await verify.applyGateLock(req.guild, cfg);
            cfg.lockApplied = true;
            cfg.lockedChannelIds = ids;
            cfg.enabled = true;
            const saved = await verify.saveConfig(db, req.params.guildId, cfg);
            res.json({ success: true, locked: true, channels: ids.length, config: saved });
        } catch (err) { next(err); }
    });

    router.post('/verification/quick-setup', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            let cfg = await verify.getConfig(db, req.params.guildId);
            if (req.body?.channelId) cfg.channelId = req.body.channelId;
            if (req.body?.mode) cfg.mode = req.body.mode === 'captcha' ? 'captcha' : 'button';
            // Honor roles picked in the Quick tab (previously only Setup → Save persisted them,
            // so Go live silently ignored the selection and auto-created duplicates).
            for (const key of ['roleId', 'unverifiedRoleId']) {
                const id = req.body?.[key];
                if (typeof id === 'string' && id && req.guild.roles.cache.has(id)) {
                    try {
                        verify.assertRoleManageable(req.guild, id);
                    } catch (err) {
                        const status = err.code === 'NOT_FOUND' ? 400 : 403;
                        return res.status(status).json({ error: err.message, code: err.code || 'HIERARCHY', field: key });
                    }
                    cfg[key] = id;
                }
            }
            if (!cfg.roleId || !cfg.unverifiedRoleId) {
                const created = await verify.createRoles(req.guild, {
                    which: !cfg.roleId && !cfg.unverifiedRoleId ? 'both' : (!cfg.roleId ? 'verified' : 'unverified'),
                });
                if (created.verified) cfg.roleId = created.verified.id;
                if (created.unverified) cfg.unverifiedRoleId = created.unverified.id;
            }
            if (!cfg.channelId) return res.status(400).json({ error: 'Pick a panel channel first' });
            if (!cfg.roleId) return res.status(400).json({ error: 'Could not create verified role' });
            cfg.enabled = true;
            if (req.body?.lockServer) {
                cfg.lockedChannelIds = await verify.applyGateLock(req.guild, cfg);
                cfg.lockApplied = true;
            }
            try {
                const panel = await verify.postPanel(req.guild, cfg, cfg.channelId);
                cfg.messageId = panel.messageId;
                cfg.channelId = panel.channelId;
                const saved = await verify.saveConfig(db, req.params.guildId, cfg);
                res.json({ success: true, panel, config: saved });
            } catch (err) {
                if (err.code === 'HIERARCHY' || err.code === 'MANAGED_ROLE' || err.code === 'EVERYONE' || err.code === 'NO_PERMS') {
                    return res.status(403).json({ error: err.message, code: err.code });
                }
                throw err;
            }
        } catch (err) { next(err); }
    });

    router.post('/verification/fix-hierarchy', requirePerm(3), rl.botMessaging(), async (req, res, next) => {
        try {
            const result = await verify.fixHierarchy(req.guild, db);
            res.json({ success: true, ...result });
        } catch (err) {
            if (err.code === 'NO_PERMS' || err.code === 'FIX_FAILED' || err.code === 'NO_BOT_MEMBER' || err.code === 'HIERARCHY') {
                return res.status(403).json({ error: err.message, code: err.code });
            }
            next(err);
        }
    });
}

module.exports = registerVerificationRoutes;
