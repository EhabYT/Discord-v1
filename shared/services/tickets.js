const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../config/bot.json');

async function handleTicketCreate(i, client, db) {
    if (!i.guild) return i.reply({ content: '❌ Tickets only work in a server.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    const cfg = await db.get(`tickets_${i.guild.id}`);
    if (!cfg) return i.reply({ content: '❌ Ticket system is not configured.', flags: [MessageFlags.Ephemeral] }).catch(() => {});

    const ext = await db.get(`opentickets_${i.guild.id}`) || {};
    if (ext[i.user.id]) return i.reply({ content: `❌ You already have an open ticket: <#${ext[i.user.id]}>`, flags: [MessageFlags.Ephemeral] }).catch(() => {});

    let count = (await db.get(`ticketcount_${i.guild.id}`)) || 0;
    const name = `ticket-${String(count + 1).padStart(4, '0')}`;
    const overrides = [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ];

    const supportRoleId = cfg.supportRoleId || cfg.supportRole;
    if (supportRoleId) {
        overrides.push({ id: supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    // Support both 'category' (old) and 'categoryId' (new dashboard)
    let parentId = cfg.categoryId || cfg.category;
    // Robust validation: ensure it's a numeric string (Snowflake) and not a placeholder or empty
    if (parentId && typeof parentId === 'string' && !/^\d+$/.test(parentId.trim())) {
        require('../lib/logger').warn(`Invalid ticket category ID "${parentId}" — falling back to no category`);
        parentId = null;
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
        if (logChannelId) {
            const logCh = await i.guild.channels.fetch(logChannelId).catch(() => null);
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
        return i.reply({ content: '❌ Failed to create ticket channel. Please check bot permissions and category configuration.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
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
    const cfg = await db.get(`tickets_${interaction.guild.id}`);
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

    const cfg = await db.get(`tickets_${i.guild.id}`);
    const closeLogId = cfg?.logChannel || cfg?.transcriptChannelId;
    if (closeLogId) {
        const logCh = await i.guild.channels.fetch(closeLogId).catch(() => null);
        if (logCh) {
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
        }
    }

    if (owner) {
        delete ext[owner];
        await db.set(`opentickets_${i.guild.id}`, ext);
    }

    await i.reply(' Closing in 5 seconds...');
    setTimeout(async () => {
        try { await i.channel.delete(); } catch (e) { }
    }, 5000);
}

module.exports = { handleTicketCreate, handleTicketClose, isTicketStaff };
