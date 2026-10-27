const { db } = require('eb-bot-database');
const { PermissionsBitField } = require('discord.js');
const { mapInBatches } = require('eb-bot-shared/utils/async');

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_REASON_LENGTH = 500;
const MAX_MEMBER_PAGE_SIZE = 100;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

// Member/moderation-record routes extracted from the monolithic guilds
// router (third extraction). Registered inline at the exact position the
// routes previously occupied, so Express matching order is unchanged.
// `requirePerm`/`rl`/`hierarchyError`/`sessionUserId` close over the live
// botClient and are passed in; `db` is a singleton required directly.
function registerMembersRoutes(router, { requirePerm, rl, hierarchyError, sessionUserId }) {
    router.get('/members', rl.heavyRead('guild-members'), async (req, res, next) => {
        try {
            const rawQuery = req.query.q;
            if (rawQuery != null && (typeof rawQuery !== 'string' || rawQuery.length > 100)) {
                return res.status(400).json({ error: 'Search query must be a string of at most 100 characters' });
            }
            if (req.query.staff != null && !['0', '1'].includes(req.query.staff)) {
                return res.status(400).json({ error: 'staff must be 0 or 1' });
            }

            const query = (rawQuery || '').trim().toLowerCase();
            let members = req.guild.members.cache;
            if (query && typeof req.guild.members.search === 'function') {
                try {
                    members = await req.guild.members.search({ query, limit: MAX_MEMBER_PAGE_SIZE });
                } catch {
                    members = req.guild.members.cache;
                }
            } else if (!query && members.size < Math.min(req.guild.memberCount || 2, 5)) {
                let timeout;
                try {
                    members = await Promise.race([
                        req.guild.members.fetch({ limit: MAX_MEMBER_PAGE_SIZE }),
                        new Promise((_, reject) => {
                            timeout = setTimeout(() => reject(new Error('timeout')), 5000);
                        }),
                    ]);
                } catch {
                    members = req.guild.members.cache;
                } finally {
                    clearTimeout(timeout);
                }
            }
            if (query && (members === req.guild.members.cache || typeof req.guild.members.search !== 'function')) {
                members = members.filter(m => m.user.username.toLowerCase().includes(query)
                    || (m.nickname && m.nickname.toLowerCase().includes(query))
                    || m.id.includes(query));
            }
            if (req.query.staff === '1') {
                members = members.filter(m => !m.user.bot && m.permissions.has(PermissionsBitField.Flags.ManageMessages));
            }
            const limit = req.query.staff === '1' ? MAX_MEMBER_PAGE_SIZE : 50;
            const data = members.first(limit).map(m => ({
                id: m.id,
                username: m.user.username,
                displayName: m.displayName,
                avatar: m.user.displayAvatarURL({ size: 64 }),
                joinedAt: m.joinedAt,
                roles: m.roles.cache.size - 1,
                isStaff: m.permissions.has(PermissionsBitField.Flags.ManageMessages),
                isBot: !!m.user.bot,
                timedOut: !!(m.communicationDisabledUntil && m.communicationDisabledUntil > Date.now()),
                highestRole: m.roles.highest && m.roles.highest.name !== '@everyone' ? m.roles.highest.name : null,
            }));
            res.json(data);
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/action', requirePerm(2), rl.limit('member-action', 20, 60_000), async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { action, reason, duration } = req.body || {};
            const allowedActions = new Set(['kick', 'ban', 'softban', 'timeout', 'untimeout', 'nickname', 'warn']);
            if (!SNOWFLAKE.test(userId)) return res.status(400).json({ error: 'Invalid userId' });
            if (!allowedActions.has(action)) return res.status(400).json({ error: 'Unknown action' });
            if (reason != null && typeof reason !== 'string') return res.status(400).json({ error: 'reason must be a string' });
            if (action === 'timeout' && (!Number.isInteger(Number(duration))
                || Number(duration) < 1_000 || Number(duration) > MAX_TIMEOUT_MS)) {
                return res.status(400).json({ error: 'duration must be between 1000 ms and 28 days' });
            }
            const safeReason = typeof reason === 'string' && reason.trim()
                ? reason.trim().slice(0, MAX_REASON_LENGTH)
                : 'Dashboard Action';
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            // Note actions are record-keeping only; everything else touches the user.
            if (action !== 'note') {
                const hErr = await hierarchyError(req, member);
                if (hErr) return res.status(403).json({ error: hErr, code: 'HIERARCHY' });
            }

            if (action === 'kick') await member.kick(safeReason);
            else if (action === 'ban') await member.ban({ reason: safeReason });
            else if (action === 'softban') {
                await member.ban({ deleteMessageSeconds: 86400, reason: safeReason });
                await req.guild.members.unban(userId, safeReason);
            }
            else if (action === 'timeout') await member.timeout(Number(duration), safeReason);
            else if (action === 'untimeout') await member.timeout(null, safeReason);
            else if (action === 'nickname') {
                const nick = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : '';
                if (nick.length > 32) return res.status(400).json({ error: 'Nickname must be 32 characters or less' });
                await member.setNickname(nick || null, reason || 'Dashboard nickname');
            }
            else if (action === 'warn') {
                const { randomUUID } = require('crypto');
                const warnings = await db.get(`warnings_${req.params.guildId}_${userId}`) || [];
                warnings.push({
                    id: randomUUID().split('-')[0],
                    // Bound both the entry and the list: `reason` was unbounded, so a
                    // 100 kb body became a 100 kb record, and the array itself never
                    // stopped growing. Keep the most recent 200.
                    reason: safeReason,
                    moderator: req.session?.user?.username || 'Dashboard',
                    timestamp: Date.now(),
                });
                await db.set(`warnings_${req.params.guildId}_${userId}`, warnings.slice(-200));
            } else {
                return res.status(400).json({ error: 'Unknown action' });
            }
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    function normalizeNotes(list) {
        return (list || []).map((n, i) => ({
            id: n.id || `legacy-${n.ts || n.timestamp || i}`,
            text: n.text,
            mod: n.mod || n.moderator || 'Unknown',
            ts: n.ts || n.timestamp || 0,
        }));
    }

    router.get('/notes', rl.heavyRead('guild-notes'), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.allByPrefix(`notes_${guildId}_`);
            const notes = allKeys
                .flatMap(e => normalizeNotes(e.value || []).map(n => ({
                    userId: e.id.replace(`notes_${guildId}_`, ''),
                    ...n,
                })))
                .sort((a, b) => (b.ts || 0) - (a.ts || 0));
            res.json(notes);
        } catch (err) { next(err); }
    });

    router.get('/members/:userId/notes', async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: 'Invalid userId' });
            const list = await db.get(`notes_${req.params.guildId}_${req.params.userId}`) || [];
            res.json(normalizeNotes(list));
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/notes', requirePerm(2), rl.limit('member-record-write', 30, 60_000), async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: 'Invalid userId' });
            const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
            if (!text) return res.status(400).json({ error: 'Note text required' });
            if (text.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or less' });
            const { randomUUID } = require('crypto');
            const key = `notes_${req.params.guildId}_${req.params.userId}`;
            const list = normalizeNotes(await db.get(key) || []);
            list.push({
                id: randomUUID().split('-')[0],
                text,
                mod: req.session?.user?.username || 'Dashboard',
                ts: Date.now(),
            });
            const capped = list.slice(-200);   // text was bounded, the list was not
            await db.set(key, capped);
            res.json(capped);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/notes/:noteId', requirePerm(2), rl.limit('member-record-write', 30, 60_000), async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId) || !/^[A-Za-z0-9_-]{1,64}$/.test(req.params.noteId)) {
                return res.status(400).json({ error: 'Invalid userId or noteId' });
            }
            const key = `notes_${req.params.guildId}_${req.params.userId}`;
            const list = normalizeNotes(await db.get(key) || []).filter(n => n.id !== req.params.noteId).slice(-200);
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/notes', requirePerm(2), rl.limit('member-record-write', 30, 60_000), async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: 'Invalid userId' });
            await db.set(`notes_${req.params.guildId}_${req.params.userId}`, []);
            res.json([]);
        } catch (err) { next(err); }
    });

    router.patch('/members/:userId/warnings/:warningId', requirePerm(2), rl.limit('member-record-write', 30, 60_000), async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId) || !/^[A-Za-z0-9_-]{1,64}$/.test(req.params.warningId)) {
                return res.status(400).json({ error: 'Invalid userId or warningId' });
            }
            const key = `warnings_${req.params.guildId}_${req.params.userId}`;
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
            if (!reason) return res.status(400).json({ error: 'Reason required' });
            if (reason.length > MAX_REASON_LENGTH) return res.status(400).json({ error: 'Reason must be 500 characters or less' });
            const list = (await db.get(key) || []).map((w, i) => {
                const id = w.id || String(w.timestamp || i);
                return id === req.params.warningId ? { ...w, id, reason } : w;
            }).slice(-200);
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/warnings/:warningId', requirePerm(2), rl.limit('member-record-write', 30, 60_000), async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId) || !/^[A-Za-z0-9_-]{1,64}$/.test(req.params.warningId)) {
                return res.status(400).json({ error: 'Invalid userId or warningId' });
            }
            const key = `warnings_${req.params.guildId}_${req.params.userId}`;
            const list = (await db.get(key) || []).filter((w, i) => {
                const id = w.id || String(w.timestamp || i);
                return id !== req.params.warningId;
            }).slice(-200);
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/warnings', requirePerm(2), rl.limit('member-record-write', 30, 60_000), async (req, res, next) => {
        try {
            if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: 'Invalid userId' });
            await db.set(`warnings_${req.params.guildId}_${req.params.userId}`, []);
            res.json([]);
        } catch (err) { next(err); }
    });

    router.delete('/warnings', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const keys = await db.allByPrefix(`warnings_${guildId}_`);
            await mapInBatches(keys, 16, (entry) => db.set(entry.id, []));
            res.json({ success: true, cleared: keys.length });
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/roles', requirePerm(3), rl.limit('member-roles', 20, 60_000), async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { roles } = req.body || {};
            if (!SNOWFLAKE.test(userId)) return res.status(400).json({ error: 'Invalid userId' });
            if (!Array.isArray(roles) || roles.length > 100 || !roles.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)) {
                return res.status(400).json({ error: 'roles must be an array of at most 100 role IDs' });
            }
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            const hErr = await hierarchyError(req, member);
            if (hErr) return res.status(403).json({ error: hErr, code: 'HIERARCHY' });

            // Privilege escalation guard: roles.set() previously accepted ANY role id,
            // so a level-3 dashboard user could grant themselves or others a role above
            // their own — or a managed/integration role the bot must not touch.
            const botTop = req.guild.members.me?.roles.highest.position ?? 0;
            const actorId = sessionUserId(req);
            let actorTop = Infinity;   // localhost dev bypass has no Discord identity
            if (actorId && actorId !== req.guild.ownerId) {
                const actor = await req.guild.members.fetch(actorId).catch(() => null);
                actorTop = actor ? actor.roles.highest.position : 0;
            }
            for (const rid of roles) {
                const role = req.guild.roles.cache.get(String(rid));
                if (!role) return res.status(400).json({ error: `Unknown role: ${rid}` });
                if (role.managed) return res.status(403).json({ error: `${role.name} is managed by an integration`, code: 'MANAGED_ROLE' });
                if (role.position >= botTop) return res.status(403).json({ error: `${role.name} is above the bot's highest role`, code: 'HIERARCHY' });
                if (role.position >= actorTop) return res.status(403).json({ error: `${role.name} is at or above your highest role`, code: 'HIERARCHY' });
            }

            await member.roles.set(roles);
            res.json({ success: true });
        } catch (err) { next(err); }
    });
}

module.exports = registerMembersRoutes;
