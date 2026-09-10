const { db } = require('eb-bot-database');

// Ticket routes extracted from the monolithic guilds router (sixth
// extraction). The four routes were scattered between logging/config and
// welcome/panel sections; ticket paths are distinct from every neighbor,
// so consolidating them here changes no matching behavior.
function registerTicketsRoutes(router, { requirePerm, rl }) {
    // GET /tickets — list open tickets (unified from both storage formats)
    router.get('/tickets', async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const allKeys = await db.allByPrefix(`ticket_${guildId}_`);
            const structured = allKeys
                .map(e => ({ id: e.id.replace(`ticket_${guildId}_`, ''), ...e.value }))
                .filter(t => t && typeof t === 'object');

            // Fallback: include tickets tracked via opentickets_ map (legacy bot format)
            const openMap = await db.get(`opentickets_${guildId}`) || {};
            const mapped = Object.entries(openMap).map(([userId, channelId]) => {
                const id = String(channelId);
                // Avoid duplicate if already in structured list
                if (structured.some(t => String(t.channelId) === id || String(t.id) === id)) return null;
                return {
                    id,
                    channelId: id,
                    userId: String(userId),
                    status: 'open',
                    createdAt: null
                };
            }).filter(Boolean);

            // Enrich mapped entries with any existing ticket_ record if available, otherwise keep mapped
            const combined = [...structured, ...mapped];
            // Deduplicate by id/channelId
            const seen = new Set();
            const deduped = [];
            for (const t of combined) {
                const key = String(t.channelId || t.id);
                if (seen.has(key)) continue;
                seen.add(key);
                deduped.push(t);
            }
            res.json(deduped);
        } catch (err) { next(err); }
    });

    router.post('/tickets', requirePerm(3), async (req, res, next) => {
        try {
            const { guildId } = req.params;
            const { categoryId, transcriptChannelId, supportRoleId, maxOpen } = req.body;
            const SNOWFLAKE = /^\d{17,20}$/;
            const guild = req.guild;

            // Validate inputs before persisting
            if (categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== '') {
                const cid = String(categoryId).trim();
                if (!SNOWFLAKE.test(cid)) return res.status(400).json({ error: 'Invalid category ID', code: 'INVALID_CATEGORY' });
                const cat = guild.channels.cache.get(cid);
                if (!cat) return res.status(404).json({ error: 'Category channel not found', code: 'NOT_FOUND' });
                if (cat.type !== 4) return res.status(400).json({ error: 'Selected channel is not a category', code: 'INVALID_CATEGORY' });
            }
            if (transcriptChannelId !== undefined && transcriptChannelId !== null && String(transcriptChannelId).trim() !== '') {
                const tid = String(transcriptChannelId).trim();
                if (!SNOWFLAKE.test(tid)) return res.status(400).json({ error: 'Invalid transcript channel ID', code: 'INVALID_CHANNEL' });
                const ch = guild.channels.cache.get(tid);
                if (!ch) return res.status(404).json({ error: 'Transcript channel not found', code: 'NOT_FOUND' });
                if (![0, 5].includes(ch.type)) return res.status(400).json({ error: 'Transcript channel must be a text channel', code: 'INVALID_CHANNEL' });
            }
            if (supportRoleId !== undefined && supportRoleId !== null && String(supportRoleId).trim() !== '') {
                const rid = String(supportRoleId).trim();
                if (!SNOWFLAKE.test(rid)) return res.status(400).json({ error: 'Invalid support role ID', code: 'INVALID_ROLE' });
                const role = guild.roles.cache.get(rid);
                if (!role) return res.status(404).json({ error: 'Support role not found', code: 'NOT_FOUND' });
                if (role.managed) return res.status(400).json({ error: 'Support role is managed by an integration', code: 'MANAGED_ROLE' });
                // Hierarchy check: bot must be able to see the role
                const botMember = guild.members.me;
                if (botMember && role.position >= botMember.roles.highest.position) {
                    return res.status(403).json({ error: 'Support role is above the bot role', code: 'HIERARCHY' });
                }
            }
            if (maxOpen !== undefined && maxOpen !== null && String(maxOpen).trim() !== '') {
                const n = Number(maxOpen);
                if (!Number.isInteger(n) || n < 1 || n > 10) return res.status(400).json({ error: 'Max open tickets must be between 1 and 10', code: 'INVALID_MAXOPEN' });
            }

            let config = await db.get(`tickets_${guildId}`);
            if (!config) {
                const legacy = await db.get(`ticket_config_${guildId}`);
                config = legacy || { categoryId: null, transcriptChannelId: null };
            }
            if (categoryId !== undefined) {
                const v = categoryId === '' || categoryId === null ? null : String(categoryId).trim() || null;
                config.categoryId = v;
                config.category = v;
            }
            if (transcriptChannelId !== undefined) {
                const v = transcriptChannelId === '' || transcriptChannelId === null ? null : String(transcriptChannelId).trim() || null;
                config.transcriptChannelId = v;
                config.logChannel = v;
            }
            if (supportRoleId !== undefined) {
                const v = supportRoleId === '' || supportRoleId === null ? null : String(supportRoleId).trim() || null;
                config.supportRoleId = v;
                config.supportRole = v;
            }
            if (maxOpen !== undefined) {
                config.maxOpen = maxOpen === '' || maxOpen === null ? 1 : Math.min(10, Math.max(1, Number(maxOpen) || 1));
            }
            config.enabled = true;
            await db.set(`tickets_${guildId}`, config);
            res.json(config);
        } catch (err) { next(err); }
    });

    // POST /tickets/panel — post a ticket button panel embed in a channel
    router.post('/tickets/panel', requirePerm(2), rl.botMessaging(), async (req, res, next) => {
        try {
            const { channelId, title, description } = req.body;
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const guild = req.guild;
            const channel = guild.channels.cache.get(channelId);
            if (!channel) return res.status(400).json({ error: 'Channel not found', code: 'NOT_FOUND' });
            if (![0, 5].includes(channel.type)) return res.status(400).json({ error: 'Panel channel must be a text channel', code: 'INVALID_CHANNEL' });

            // Warn if ticket system not yet configured — panel would immediately error with "not configured"
            const cfg = await db.get(`tickets_${guild.id}`) || await db.get(`ticket_config_${guild.id}`);
            if (!cfg) {
                // Allow posting but inform caller that setup is missing — dashboard will toast a hint
                // Do not block; admin may want to post panel before full config.
            }

            if (title != null && String(title).length > 256) {
                return res.status(400).json({ error: 'Title must be 256 characters or fewer', code: 'INVALID_TITLE' });
            }
            if (description != null && String(description).length > 4000) {
                return res.status(400).json({ error: 'Description must be 4000 characters or fewer', code: 'INVALID_DESC' });
            }

            const embed = new EmbedBuilder()
                .setTitle(String(title || 'Support Tickets').slice(0, 256))
                .setDescription(String(description || 'Click the button below to open a support ticket.').slice(0, 4000))
                .setColor(0x00FFFF)
                .setFooter({ text: guild.name });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Open Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫')
            );
            try {
                await channel.send({ embeds: [embed], components: [row] });
            } catch (sendErr) {
                const msg = String(sendErr.message || '');
                if (/Missing Permissions|Missing Access/i.test(msg)) {
                    return res.status(403).json({ error: 'Bot lacks permission to send in that channel', code: 'NO_PERMS' });
                }
                throw sendErr;
            }
            res.json({ success: true, warned: !cfg ? 'Ticket system not yet configured — save configuration before members use the panel.' : undefined });
        } catch (err) { next(err); }
    });

    // POST /tickets/:ticketId/close — mark a ticket closed (dashboard)
    router.post('/tickets/:ticketId/close', requirePerm(2), async (req, res, next) => {
        try {
            const { guildId, ticketId } = req.params;
            const key = `ticket_${guildId}_${ticketId}`;
            let ticket = await db.get(key);
            // Fallback to opentickets map if structured record missing (bot-created tickets)
            let channelId = ticket?.channelId || ticket?.channel || ticketId;
            let ownerId = ticket?.userId || null;
            if (!ticket) {
                const openMap = await db.get(`opentickets_${guildId}`) || {};
                // Find owner by channelId
                for (const [uid, cid] of Object.entries(openMap)) {
                    if (String(cid) === String(ticketId) || String(cid) === String(channelId)) {
                        ownerId = uid;
                        channelId = String(cid);
                        ticket = { userId: uid, channelId, status: 'open', id: ticketId };
                        break;
                    }
                }
                // Also try ticketId as channelId directly
                if (!ticket) {
                    const cid = String(ticketId);
                    const ch = await req.guild.channels.fetch(cid).catch(() => null);
                    if (ch && ch.name.startsWith('ticket-')) {
                        ticket = { channelId: cid, status: 'open', id: ticketId };
                        channelId = cid;
                    }
                }
                if (!ticket) return res.status(404).json({ error: 'Ticket not found', code: 'NOT_FOUND' });
            }
            ticket.status = 'closed';
            ticket.closedAt = Date.now();
            ticket.closedBy = req.session?.user?.id || 'dashboard';
            await db.set(key, ticket);

            // Clean opentickets map
            try {
                const ext = await db.get(`opentickets_${guildId}`) || {};
                let toDelete = ownerId;
                if (!toDelete) {
                    for (const [uid, cid] of Object.entries(ext)) {
                        if (String(cid) === String(channelId)) { toDelete = uid; break; }
                    }
                }
                if (toDelete && ext[toDelete]) {
                    delete ext[toDelete];
                    await db.set(`opentickets_${guildId}`, ext);
                }
            } catch { /* ignore */ }

            const channel = await req.guild.channels.fetch(String(channelId)).catch(() => null);
            if (channel) await channel.delete('Closed from dashboard').catch(() => {});
            res.json({ success: true, ticket });
        } catch (err) { next(err); }
    });
}

module.exports = registerTicketsRoutes;
