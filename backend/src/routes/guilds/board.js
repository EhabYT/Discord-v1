const { db } = require('eb-bot-database');
const board = require('eb-bot-shared/services/staff-board');

// Staff-board routes extracted from the monolithic guilds router (phase-1
// audit: ~104 kB single file). Registered inline at the exact position the
// routes previously occupied, so Express matching order is unchanged.
// `requirePerm`/`rl` are passed in because they close over the live botClient;
// `db` and the board service are singletons required here directly (Node
// module cache returns the identical instances guilds.js used).
function registerBoardRoutes(router, { requirePerm, rl }) {
    router.get('/board', async (req, res, next) => {
        try {
            const [announcements, afk, reminders] = await Promise.all([
                board.listAnnouncements(db, req.params.guildId),
                board.listAfk(req.guild, db),
                board.listReminders(req.guild, db),
            ]);
            res.json({
                announcements: [...announcements].reverse(),
                afk,
                reminders,
            });
        } catch (err) { next(err); }
    });

    router.post('/board/announce', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
        try {
            res.json(await board.postAnnouncement(req.guild, db, {
                ...(req.body || {}),
                authorTag: req.session?.user?.username || 'Dashboard',
            }));
        } catch (err) { next(err); }
    });

    router.delete('/board/announce/:id', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.deleteAnnouncement(req.guild, db, req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/board/afk/:userId', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.clearAfk(db, req.params.guildId, req.params.userId));
        } catch (err) { next(err); }
    });

    router.post('/board/reminders', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.addReminder(req.guild, db, {
                ...(req.body || {}),
                userId: req.session?.user?.id || 'dashboard',
            }));
        } catch (err) { next(err); }
    });

    router.delete('/board/reminders/:userId/:index', requirePerm(2), async (req, res, next) => {
        try {
            res.json(await board.cancelReminder(db, req.params.userId, Number(req.params.index)));
        } catch (err) { next(err); }
    });
}

module.exports = registerBoardRoutes;
