const { db } = require('eb-bot-database');
const { PermissionsBitField } = require('discord.js');

// Member/moderation-record routes extracted from the monolithic guilds
// router (third extraction). Registered inline at the exact position the
// routes previously occupied, so Express matching order is unchanged.
// `requirePerm`/`rl`/`hierarchyError`/`sessionUserId` close over the live
// botClient and are passed in; `db` is a singleton required directly.
function registerMembersRoutes(router, { requirePerm, rl, hierarchyError, sessionUserId }) {
    router.get('/members', async (req, res, next) => {
        try {
            const query = (req.query.q || '').toLowerCase();
            let members = req.guild.members.cache;
            if (members.size < Math.min(req.guild.memberCount || 2, 5)) {
                try {
                    members = await Promise.race([
                        req.guild.members.fetch(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
                    ]);
                } catch {
                    members = req.guild.members.cache;
                }
            }
            if (query) {
                members = members.filter(m => m.user.username.toLowerCase().includes(query) || (m.nickname && m.nickname.toLowerCase().includes(query)) || m.id.includes(query));
            }
            if (req.query.staff === '1') {
                members = members.filter(m => !m.user.bot && m.permissions.has(PermissionsBitField.Flags.ManageMessages));
            }
            const limit = req.query.staff === '1' ? 100 : 50;
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

    router.post('/members/:userId/action', requirePerm(2), async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { action, reason, duration } = req.body;
            const member = await req.guild.members.fetch(userId);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            // Note actions are record-keeping only; everything else touches the user.
            if (action !== 'note') {
                const hErr = await hierarchyError(req, member);
                if (hErr) return res.status(403).json({ error: hErr, code: 'HIERARCHY' });
            }

            if (action === 'kick') await member.kick(reason || 'Dashboard Action');
            else if (action === 'ban') await member.ban({ reason: reason || 'Dashboard Action' });
            else if (action === 'softban') {
                await member.ban({ deleteMessageSeconds: 86400, reason: reason || 'Dashboard softban' });
                await req.guild.members.unban(userId, reason || 'Dashboard softban');
            }
            else if (action === 'timeout') await member.timeout(duration || 60000, reason || 'Dashboard Action');
            else if (action === 'untimeout') await member.timeout(null, reason || 'Dashboard unmute');
            else if (action === 'nickname') {
                const nick = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : '';
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
                    reason: String(reason || 'Dashboard Action').slice(0, 500),
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

    router.get('/notes', async (req, res, next) => {
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
            const list = await db.get(`notes_${req.params.guildId}_${req.params.userId}`) || [];
            res.json(normalizeNotes(list));
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/notes', requirePerm(2), async (req, res, next) => {
        try {
            const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
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

    router.delete('/members/:userId/notes/:noteId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `notes_${req.params.guildId}_${req.params.userId}`;
            const list = normalizeNotes(await db.get(key) || []).filter(n => n.id !== req.params.noteId);
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/notes', requirePerm(2), async (req, res, next) => {
        try {
            await db.set(`notes_${req.params.guildId}_${req.params.userId}`, []);
            res.json([]);
        } catch (err) { next(err); }
    });

    router.patch('/members/:userId/warnings/:warningId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `warnings_${req.params.guildId}_${req.params.userId}`;
            const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
            if (!reason) return res.status(400).json({ error: 'Reason required' });
            const list = (await db.get(key) || []).map((w, i) => {
                const id = w.id || String(w.timestamp || i);
                return id === req.params.warningId ? { ...w, id, reason } : w;
            });
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/warnings/:warningId', requirePerm(2), async (req, res, next) => {
        try {
            const key = `warnings_${req.params.guildId}_${req.params.userId}`;
            const list = (await db.get(key) || []).filter((w, i) => {
                const id = w.id || String(w.timestamp || i);
                return id !== req.params.warningId;
            });
            await db.set(key, list);
            res.json(list);
        } catch (err) { next(err); }
    });

    router.delete('/members/:userId/warnings', requirePerm(2), async (req, res, next) => {
        try {
            await db.set(`warnings_${req.params.guildId}_${req.params.userId}`, []);
            res.json([]);
        } catch (err) { next(err); }
    });

    router.delete('/warnings', requirePerm(3), rl.bulkModeration(), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const keys = await db.allByPrefix(`warnings_${guildId}_`);
            await Promise.all(keys.map(e => db.set(e.id, [])));
            res.json({ success: true, cleared: keys.length });
        } catch (err) { next(err); }
    });

    router.post('/members/:userId/roles', requirePerm(3), async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { roles } = req.body;
            if (!Array.isArray(roles)) return res.status(400).json({ error: 'roles must be an array' });
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
