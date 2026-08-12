const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.json');

async function handleTicketCreate(i, client, db) {
    const cfg = await db.get(`tickets_${i.guild.id}`);
    if (!cfg) return i.reply({ content: ' Not configured.', flags: [MessageFlags.Ephemeral] });

    const ext = await db.get(`opentickets_${i.guild.id}`) || {};
    if (ext[i.user.id]) return i.reply({ content: ` Already open: <#${ext[i.user.id]}>`, flags: [MessageFlags.Ephemeral] });

    let count = (await db.get(`ticketcount_${i.guild.id}`)) || 0;
    count++;
    await db.set(`ticketcount_${i.guild.id}`, count);

    const name = `ticket-${String(count).padStart(4, '0')}`;
    const overrides = [
        { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ];

    if (cfg.supportRole) {
        overrides.push({ id: cfg.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    // Support both 'category' (old) and 'categoryId' (new dashboard)
    let parentId = cfg.categoryId || cfg.category;
    // Robust validation: ensure it's a numeric string (Snowflake) and not a placeholder or empty
    if (parentId && typeof parentId === 'string' && !/^\d+$/.test(parentId.trim())) {
        console.error(`Invalid ticket category ID encountered: "${parentId}" - Falling back to no category.`);
        parentId = null;
    }

    try {
        const ch = await i.guild.channels.create({
            name: name,
            type: ChannelType.GuildText,
            parent: parentId,
            permissionOverwrites: overrides
        });

        ext[i.user.id] = ch.id;
        await db.set(`opentickets_${i.guild.id}`, ext);

        const embed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle(` ${name}`)
            .setDescription(`Welcome ${i.user}!\n\nDescribe your issue. Support will be with you shortly.`)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await ch.send({ embeds: [embed], components: [row] });
        await i.reply({ content: ` Ticket created: ${ch}`, flags: [MessageFlags.Ephemeral] });

        if (cfg.logChannel) {
            const logCh = await i.guild.channels.fetch(cfg.logChannel).catch(() => null);
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
        console.error('Failed to create ticket channel:', err);
        return i.reply({ content: '❌ Failed to create ticket channel. Please check bot permissions and category configuration.', flags: [MessageFlags.Ephemeral] });
    }
}

async function handleTicketClose(i, db) {
    const ext = await db.get(`opentickets_${i.guild.id}`) || {};
    let owner = null;
    for (const [userId, channelId] of Object.entries(ext)) {
        if (channelId === i.channel.id) {
            owner = userId;
            break;
        }
    }

    const cfg = await db.get(`tickets_${i.guild.id}`);
    if (cfg && cfg.logChannel) {
        const logCh = await i.guild.channels.fetch(cfg.logChannel).catch(() => null);
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

module.exports = { handleTicketCreate, handleTicketClose };
