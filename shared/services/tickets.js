const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config/bot-config').config;

const SNOWFLAKE_RE = /^\d{17,20}$/;

async function getTicketConfig(db, guildId) {
    const gid = String(guildId);
    let cfg = await db.get(`tickets_${gid}`);
    if (cfg) return cfg;
    // Legacy key from early dashboard versions
    const legacy = await db.get(`ticket_config_${gid}`);
    if (legacy) {
        // Migrate legacy shape to current key for future reads
        try { await db.set(`tickets_${gid}`, legacy); } catch { /* ignore */ }
        return legacy;
    }
    return null;
}

async function handleTicketCreate(i, client, db) {
    if (!i.guild) return i.reply({ content: '❌ Tickets only work in a server.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    let cfg = await getTicketConfig(db, i.guild.id);
    if (!cfg) {
        // Auto-enable with sensible defaults so the button works even before setup.
        // Admins can still customise category / support role later via /ticket setup or dashboard.
        cfg = { enabled: true };
        try { await db.set(`tickets_${i.guild.id}`, cfg); } catch { /* ignore */ }
        require('../lib/logger').warn(`Ticket system auto-configured for guild ${i.guild.id} (no prior config)`);
    }
    if (cfg.enabled === false) {
        return i.reply({ content: '❌ Ticket system is currently disabled. An admin can re-enable it with `/ticket setup` or in the dashboard.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }

    // Validate opentickets map and clean stale entries where channel no longer exists
    const ext = await db.get(`opentickets_${i.guild.id}`) || {};
    // If user already has a ticket, verify it still exists
    if (ext[i.user.id]) {
        const existingId = String(ext[i.user.id]);
        const existingCh = await i.guild.channels.fetch(existingId).catch(() => null);
        if (existingCh) {
            return i.reply({ content: `❌ You already have an open ticket: <#${existingId}>`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
        }
        // Stale entry – channel was deleted, free the slot
        delete ext[i.user.id];
        await db.set(`opentickets_${i.guild.id}`, ext);
    }

    // Respect maxOpen if configured (dashboard allows 1-10)
    const maxOpen = Number(cfg.maxOpen) > 0 ? Number(cfg.maxOpen) : 1;
    if (maxOpen > 1) {
        const userTickets = await db.allByPrefix(`ticket_${i.guild.id}_`).catch(() => []);
        const openForUser = userTickets.filter(e => e.value?.userId === i.user.id && e.value?.status !== 'closed').length;
        if (openForUser >= maxOpen) {
            return i.reply({ content: `❌ You already have ${openForUser} open ticket(s) (max ${maxOpen}). Close one first.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
        }
    }

    let count = (await db.get(`ticketcount_${i.guild.id}`)) || 0;
    const name = `ticket-${String(count + 1).padStart(4, '0')}`;
    const overrides = [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ];

    const supportRoleId = cfg.supportRoleId || cfg.supportRole;
    if (supportRoleId && SNOWFLAKE_RE.test(String(supportRoleId).trim())) {
        overrides.push({ id: String(supportRoleId).trim(), allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    // Support both 'category' (old) and 'categoryId' (new dashboard)
    let parentId = cfg.categoryId || cfg.category;
    if (parentId != null) parentId = String(parentId).trim();
    if (!parentId || parentId === 'null' || parentId === 'undefined') parentId = null;
    // Robust validation: ensure it's a numeric snowflake
    if (parentId && !SNOWFLAKE_RE.test(parentId)) {
        require('../lib/logger').warn(`Invalid ticket category ID "${parentId}" — falling back to no category`);
        parentId = null;
    }
    // If category is set, verify it exists and is a category channel
    if (parentId) {
        const cat = await i.guild.channels.fetch(parentId).catch(() => null);
        if (!cat || cat.type !== ChannelType.GuildCategory) {
            require('../lib/logger').warn(`Ticket category ${parentId} not found or not a category — creating at top level`);
            parentId = null;
        }
    }

    try {
        const ch = await i.guild.channels.create({
            name: name,
            type: ChannelType.GuildText,
            parent: parentId,
            permissionOverwrites: overrides
        });

        count += 1;
        await db.set(`ticketcount_${i.guild.id}`, count);
        ext[i.user.id] = ch.id;
        await db.set(`opentickets_${i.guild.id}`, ext);
        // Persist structured ticket record for dashboard listing / close
        try {
            await db.set(`ticket_${i.guild.id}_${ch.id}`, {
                userId: i.user.id,
                channelId: ch.id,
                channelName: name,
                status: 'open',
                createdAt: Date.now(),
                createdBy: i.user.id
            });
        } catch { /* dashboard listing is secondary */ }

        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle(` ${name}`)
            .setDescription(`Welcome ${i.user}!\n\nDescribe your issue. Support will be with you shortly.`)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🎟️'),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await ch.send({ embeds: [embed], components: [row] });
        await i.reply({ content: `✅ Ticket created: ${ch}`, flags: [MessageFlags.Ephemeral] }).catch(() => {});

        const logChannelId = cfg.logChannel || cfg.transcriptChannelId;
        if (logChannelId && SNOWFLAKE_RE.test(String(logChannelId).trim())) {
            const logCh = await i.guild.channels.fetch(String(logChannelId).trim()).catch(() => null);
            if (logCh) {
                await logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(config.colors.success)
                            .setTitle(' Ticket Created')
                            .addFields(
                                { name: 'User', value: String(i.user), inline: true },
                                { name: 'Channel', value: String(ch), inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            }
        }
    } catch (err) {
        require('../lib/logger').error('Failed to create ticket channel', { error: err.message });
        const botMember = i.guild.members?.me;
        const canManage = botMember ? botMember.permissions.has(PermissionFlagsBits.ManageChannels) : null;
        const hint = canManage === false
            ? 'The bot is missing **Manage Channels** — give it that permission and move its role above the ticket category.'
            : 'Please check bot permissions and category configuration.';
        // Use ephemeral via flags for newer API, fallback to ephemeral: true
        return i.reply({ content: `❌ Failed to create ticket channel. ${hint}`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
}

/**
 * Is this member ticket staff? True for the configured support role, anyone
 * with ManageChannels, and the guild owner.
 *
 * The claim button previously trusted whoever clicked it, so the person who
 * opened the ticket could mark themselves as the handling staff member and
 * rewrite the channel topic.
 */
async function isTicketStaff(interaction, db) {
    const member = interaction.member;
    if (!member) return false;
    if (interaction.guild?.ownerId === interaction.user.id) return true;
    try {
        if (member.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
    } catch { /* ignore */ }
    const cfg = await getTicketConfig(db, interaction.guild.id);
    const supportRoleId = cfg?.supportRoleId || cfg?.supportRole;
    if (supportRoleId && member.roles?.cache?.has(String(supportRoleId))) return true;
    return false;
}

async function handleTicketClose(i, db) {
    if (!i.guild) return i.reply({ content: '❌ Tickets only work in a server.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    const ext = await db.get(`opentickets_${i.guild.id}`) || {};
    let owner = null;
    for (const [userId, channelId] of Object.entries(ext)) {
        if (channelId === i.channel.id) {
            owner = userId;
            break;
        }
    }
    // Also try ticket_ record if opentickets missed (e.g., multi-open)
    if (!owner) {
        const rec = await db.get(`ticket_${i.guild.id}_${i.channel.id}`).catch(() => null);
        if (rec?.userId) owner = String(rec.userId);
    }

    const cfg = await getTicketConfig(db, i.guild.id);
    const closeLogId = cfg?.logChannel || cfg?.transcriptChannelId;
    if (closeLogId && SNOWFLAKE_RE.test(String(closeLogId).trim())) {
        const logCh = await i.guild.channels.fetch(String(closeLogId).trim()).catch(() => null);
        if (logCh) {
            try {
                const msgs = await i.channel.messages.fetch({ limit: 100 });
                const trans = msgs.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[embed]'}`).join('\n');
                await logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle(' Ticket Closed')
                            .addFields(
                                { name: 'Channel', value: i.channel.name, inline: true },
                                { name: 'Closed by', value: String(i.user), inline: true }
                            )
                            .setDescription(`\`\`\`\n${trans.slice(0, 4000)}\n\`\`\``)
                            .setTimestamp()
                    ]
                });
            } catch { /* transcript is best-effort */ }
        }
    }

    if (owner) {
        delete ext[owner];
        await db.set(`opentickets_${i.guild.id}`, ext);
    }
    // Mark structured record closed
    try {
        const rec = await db.get(`ticket_${i.guild.id}_${i.channel.id}`);
        if (rec) {
            rec.status = 'closed';
            rec.closedAt = Date.now();
            rec.closedBy = i.user.id;
            await db.set(`ticket_${i.guild.id}_${i.channel.id}`, rec);
        }
    } catch { /* ignore */ }

    await i.reply(' Closing in 5 seconds...');
    setTimeout(async () => {
        try { await i.channel.delete(); } catch (e) { }
    }, 5000);
}

module.exports = { handleTicketCreate, handleTicketClose, isTicketStaff, getTicketConfig };
