const { db } = require('eb-bot-database');
const { getUserPermLevel } = require('../../middleware/permissions');
const { sessionUserId } = require('../../middleware/auth');
const suggestions = require('eb-bot-shared/services/suggestions');
const polls = require('eb-bot-shared/services/polls');
const tags = require('eb-bot-shared/services/tags');
const confessions = require('eb-bot-shared/services/confessions');

// Suggestions/polls/tags/confessions routes extracted from the monolithic
// guilds router (fifth extraction). Registered inline at the exact position
// the routes previously occupied, so Express matching order is unchanged.
// `botClient` is used read-only for the anonymous-visibility level checks
// via the shared permission helpers (same module instances as guilds.js).
function registerCommunityRoutes(router, { requirePerm, botClient }) {
    router.get('/suggestions', async (req, res, next) => {
        try {
            const items = await suggestions.list(db, req.params.guildId);
            const config = await suggestions.getConfig(db, req.params.guildId);
            // /suggest offers "anonymous — hide your username", and the posted embed
            // honours it. The dashboard must honour it too: strip identity from
            // anonymous suggestions below Moderator, or the promise is hollow.
            const level = await getUserPermLevel(botClient, req.params.guildId, sessionUserId(req));
            const visible = level >= 2
                ? [...items].reverse()
                : [...items].reverse().map((s) => (s.anonymous
                    ? (({ authorId, authorTag, ...rest }) => rest)(s)
                    : s));
            res.json({
                items: visible,
                config,
                pending: items.filter((s) => s.status === 'pending').length,
            });
        } catch (err) { next(err); }
    });

    router.post('/suggestions/config', requirePerm(3), async (req, res, next) => {
        try {
            const current = await suggestions.getConfig(db, req.params.guildId);
            const saved = await suggestions.saveConfig(db, req.params.guildId, { ...current, ...(req.body || {}) });
            res.json(saved);
        } catch (err) { next(err); }
    });

    router.post('/suggestions', requirePerm(2), async (req, res, next) => {
        try {
            const item = await suggestions.create(req.guild, db, {
                message: req.body?.message,
                anonymous: !!req.body?.anonymous,
                channelId: req.body?.channelId,
                authorId: req.session?.user?.id || 'dashboard',
                authorTag: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.post('/suggestions/:id/approve', requirePerm(2), async (req, res, next) => {
        try {
            const item = await suggestions.setStatus(req.guild, db, req.params.id, 'approved', {
                note: req.body?.note,
                reviewedBy: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.post('/suggestions/:id/deny', requirePerm(2), async (req, res, next) => {
        try {
            const item = await suggestions.setStatus(req.guild, db, req.params.id, 'denied', {
                note: req.body?.note,
                reviewedBy: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.delete('/suggestions/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await suggestions.remove(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.get('/polls', async (req, res, next) => {
        try {
            const list = await polls.list(db, req.params.guildId);
            const enriched = [];
            for (const p of [...list].reverse()) {
                const liveResults = p.closed ? (p.results || []) : await polls.tally(req.guild, p).catch(() => p.options || []);
                enriched.push({ ...p, liveResults });
            }
            res.json({ polls: enriched, open: list.filter((p) => !p.closed).length });
        } catch (err) { next(err); }
    });

    router.post('/polls', requirePerm(2), async (req, res, next) => {
        try {
            const poll = await polls.create(req.guild, db, {
                channelId: req.body?.channelId,
                question: req.body?.question,
                options: req.body?.options,
                durationMs: req.body?.durationMs,
                authorId: req.session?.user?.id || 'dashboard',
                authorTag: req.session?.user?.username || 'Dashboard',
            });
            res.json(poll);
        } catch (err) { next(err); }
    });

    router.post('/polls/:id/close', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await polls.close(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/polls/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await polls.remove(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.get('/tags', async (req, res, next) => {
        try {
            res.json({ tags: await tags.list(db, req.params.guildId) });
        } catch (err) { next(err); }
    });

    router.post('/tags', requirePerm(2), async (req, res, next) => {
        try {
            const item = await tags.upsert(db, req.params.guildId, req.body?.name, req.body?.content, req.session?.user?.id || 'dashboard');
            res.json(item);
        } catch (err) { next(err); }
    });

    router.delete('/tags/:name', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await tags.remove(db, req.params.guildId, req.params.name));
        } catch (err) { next(err); }
    });

    router.get('/confessions', async (req, res, next) => {
        try {
            const config = await confessions.getConfig(db, req.params.guildId);
            const items = [...(await confessions.list(db, req.params.guildId))].reverse();
            // Confessions are anonymous by design. authorId/authorTag are only
            // retained when staffLog is enabled, and must not be handed to every
            // dashboard Viewer — strip them below Moderator (level 2).
            const level = await getUserPermLevel(botClient, req.params.guildId, sessionUserId(req));
            const safe = level >= 2
                ? items
                : items.map(({ authorId, authorTag, ...rest }) => rest);
            res.json({ items: safe, config });
        } catch (err) { next(err); }
    });

    router.post('/confessions/config', requirePerm(3), async (req, res, next) => {
        try {
            const current = await confessions.getConfig(db, req.params.guildId);
            res.json(await confessions.saveConfig(db, req.params.guildId, { ...current, ...(req.body || {}) }));
        } catch (err) { next(err); }
    });

    router.post('/confessions', requirePerm(2), async (req, res, next) => {
        try {
            const item = await confessions.create(req.guild, db, {
                message: req.body?.message,
                channelId: req.body?.channelId,
                skipCooldown: true,
                authorId: req.session?.user?.id || 'dashboard',
                authorTag: req.session?.user?.username || 'Dashboard',
            });
            res.json(item);
        } catch (err) { next(err); }
    });

    router.delete('/confessions/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await confessions.remove(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });
}

module.exports = registerCommunityRoutes;
