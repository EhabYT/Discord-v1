const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const logger = require('../lib/logger');

const KEY = (guildId) => `verification_${guildId}`;
const PENDING_KEY = (guildId) => `verification_pending_${guildId}`;
const LOG_KEY = (guildId) => `verification_log_${guildId}`;

const BUTTON_STYLES = {
    Success: ButtonStyle.Success,
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Danger: ButtonStyle.Danger,
};

const DEFAULTS = {
    enabled: false,
    roleId: null,
    unverifiedRoleId: null,
    extraRoleIds: [],
    bypassRoleIds: [],
    channelId: null,
    logChannelId: null,
    messageId: null,
    mode: 'button',
    minAccountAgeDays: 0,
    kickUnverifiedMinutes: 0,
    kickOnFail: false,
    dmOnVerify: false,
    dmMessage: 'You are now verified in {guild}. Welcome!',
    successMessage: '✅ You have been verified!',
    failMessage: '❌ Verification failed. Please contact staff.',
    alreadyMessage: '✅ You are already verified.',
    title: 'Server Verification',
    description: 'Click the button below to verify and unlock the server.',
    buttonLabel: 'Verify',
    buttonEmoji: '✅',
    buttonStyle: 'Success',
    embedColor: '#00fbff',
    showGuildIcon: true,
    requireRules: false,
    rulesText: '',
    removeUnverifiedOnVerify: true,
    denyBots: true,
    announceChannelId: null,
    announceMessage: '{user} just verified. Welcome to {guild}!',
    panelImage: '',
    panelThumbnail: '',
    footerText: '',
    pingStaffRoleId: null,
    lockApplied: false,
    lockedChannelIds: [],
};

function defaults(raw = {}) {
    const extra = Array.isArray(raw.extraRoleIds) ? raw.extraRoleIds.filter(Boolean) : [];
    const bypass = Array.isArray(raw.bypassRoleIds) ? raw.bypassRoleIds.filter(Boolean) : [];
    const color = /^#[0-9a-fA-F]{6}$/.test(raw.embedColor || '') ? raw.embedColor : DEFAULTS.embedColor;
    const mode = raw.mode === 'captcha' ? 'captcha' : 'button';
    const style = BUTTON_STYLES[raw.buttonStyle] ? raw.buttonStyle : 'Success';
    return {
        ...DEFAULTS,
        ...raw,
        enabled: !!raw.enabled,
        roleId: raw.roleId || null,
        unverifiedRoleId: raw.unverifiedRoleId || null,
        extraRoleIds: extra.slice(0, 8),
        bypassRoleIds: bypass.slice(0, 8),
        channelId: raw.channelId || raw.logChannelId || null,
        logChannelId: raw.logChannelId || null,
        messageId: raw.messageId || null,
        mode,
        minAccountAgeDays: Math.max(0, Math.min(365, Number(raw.minAccountAgeDays) || 0)),
        kickUnverifiedMinutes: Math.max(0, Math.min(10080, Number(raw.kickUnverifiedMinutes) || 0)),
        kickOnFail: !!raw.kickOnFail,
        dmOnVerify: !!raw.dmOnVerify,
        dmMessage: String(raw.dmMessage || DEFAULTS.dmMessage).slice(0, 1000),
        successMessage: String(raw.successMessage || DEFAULTS.successMessage).slice(0, 500),
        failMessage: String(raw.failMessage || DEFAULTS.failMessage).slice(0, 500),
        alreadyMessage: String(raw.alreadyMessage || DEFAULTS.alreadyMessage).slice(0, 500),
        title: String(raw.title || DEFAULTS.title).slice(0, 256),
        description: String(raw.description || DEFAULTS.description).slice(0, 2000),
        buttonLabel: String(raw.buttonLabel || DEFAULTS.buttonLabel).slice(0, 80),
        buttonEmoji: String(raw.buttonEmoji || DEFAULTS.buttonEmoji).slice(0, 64),
        buttonStyle: style,
        embedColor: color,
        showGuildIcon: raw.showGuildIcon !== false,
        requireRules: !!raw.requireRules,
        rulesText: String(raw.rulesText || '').slice(0, 1000),
        removeUnverifiedOnVerify: raw.removeUnverifiedOnVerify !== false,
        denyBots: raw.denyBots !== false,
        announceChannelId: raw.announceChannelId || null,
        announceMessage: String(raw.announceMessage || DEFAULTS.announceMessage).slice(0, 1000),
        panelImage: String(raw.panelImage || '').slice(0, 500),
        panelThumbnail: String(raw.panelThumbnail || '').slice(0, 500),
        footerText: String(raw.footerText || '').slice(0, 200),
        pingStaffRoleId: raw.pingStaffRoleId || null,
        lockApplied: !!raw.lockApplied,
        lockedChannelIds: Array.isArray(raw.lockedChannelIds) ? raw.lockedChannelIds.slice(0, 200) : [],
    };
}

function replaceVars(str, member, guild) {
    return String(str || '')
        .replace(/{user}/g, member ? String(member) : '@member')
        .replace(/{userName}/g, member?.user?.username || 'member')
        .replace(/{guild}/g, guild?.name || 'server')
        .replace(/{count}/g, String(guild?.memberCount || 0));
}

async function getConfig(db, guildId) {
    return defaults(await db.get(KEY(guildId)) || {});
}

async function saveConfig(db, guildId, cfg) {
    const next = defaults(cfg);
    await db.set(KEY(guildId), next);
    return next;
}

async function getPendingMap(db, guildId) {
    const raw = await db.get(PENDING_KEY(guildId));
    return raw && typeof raw === 'object' ? raw : {};
}

async function setPendingMap(db, guildId, map) {
    await db.set(PENDING_KEY(guildId), map);
}

async function markPending(db, guildId, member, cfg) {
    const map = await getPendingMap(db, guildId);
    const joinedAt = Date.now();
    map[member.id] = {
        userId: member.id,
        username: member.user?.username || member.id,
        displayName: member.displayName || member.user?.username || member.id,
        avatar: member.user?.displayAvatarURL?.({ size: 64 }) || null,
        joinedAt,
        kickAt: cfg.kickUnverifiedMinutes > 0 ? joinedAt + cfg.kickUnverifiedMinutes * 60 * 1000 : null,
    };
    await setPendingMap(db, guildId, map);
    return map[member.id];
}

async function clearPending(db, guildId, userId) {
    const map = await getPendingMap(db, guildId);
    if (!map[userId]) return;
    delete map[userId];
    await setPendingMap(db, guildId, map);
}

async function getLog(db, guildId) {
    const list = await db.get(LOG_KEY(guildId));
    return Array.isArray(list) ? list : [];
}

async function appendLog(db, guildId, entry) {
    const list = await getLog(db, guildId);
    list.unshift(entry);
    await db.set(LOG_KEY(guildId), list.slice(0, 200));
}

async function clearLog(db, guildId) {
    await db.set(LOG_KEY(guildId), []);
}

function hasBypass(member, cfg) {
    if (!member) return false;
    return (cfg.bypassRoleIds || []).some((id) => member.roles?.cache?.has(id));
}

function isVerified(member, cfg) {
    return !!(cfg.roleId && member.roles?.cache?.has(cfg.roleId));
}

function accountTooNew(user, days) {
    if (!days || !user?.createdTimestamp) return false;
    const minAge = days * 24 * 60 * 60 * 1000;
    return Date.now() - user.createdTimestamp < minAge;
}

function buildPanelPayload(guild, cfg) {
    const descParts = [cfg.description || DEFAULTS.description];
    if (cfg.requireRules && cfg.rulesText) {
        descParts.push('', '**Rules**', cfg.rulesText);
    }
    if (cfg.mode === 'captcha') {
        descParts.push('', '_You will solve a short math check after clicking._');
    }
    if (cfg.minAccountAgeDays > 0) {
        descParts.push('', `_Accounts must be at least ${cfg.minAccountAgeDays} day(s) old._`);
    }

    const embed = new EmbedBuilder()
        .setColor(cfg.embedColor || DEFAULTS.embedColor)
        .setTitle(cfg.title || DEFAULTS.title)
        .setDescription(descParts.join('\n').slice(0, 4096))
        .setFooter({
            text: cfg.footerText || guild.name,
            iconURL: guild.iconURL() || undefined,
        });

    const thumb = cfg.panelThumbnail || (cfg.showGuildIcon ? guild.iconURL({ size: 128 }) : null);
    if (thumb) embed.setThumbnail(thumb);
    if (cfg.panelImage) {
        try { embed.setImage(cfg.panelImage); } catch { /* ignore bad url */ }
    }

    const button = new ButtonBuilder()
        .setCustomId('verification_entry')
        .setLabel(cfg.buttonLabel || 'Verify')
        .setStyle(BUTTON_STYLES[cfg.buttonStyle] || ButtonStyle.Success);

    if (cfg.buttonEmoji) {
        try { button.setEmoji(cfg.buttonEmoji); } catch { /* ignore invalid emoji */ }
    }

    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
    };
}

async function postPanel(guild, cfg, channelId) {
    const channel = guild.channels.cache.get(channelId || cfg.channelId);
    if (!channel) throw new Error('Channel not found');
    const payload = buildPanelPayload(guild, cfg);

    if (cfg.messageId) {
        const existing = await channel.messages.fetch(cfg.messageId).catch(() => null);
        if (existing) {
            await existing.edit(payload);
            return { messageId: existing.id, updated: true, channelId: channel.id };
        }
    }

    const sent = await channel.send(payload);
    return { messageId: sent.id, updated: false, channelId: channel.id };
}

async function staffLog(guild, cfg, embed) {
    const id = cfg.logChannelId;
    if (!id) return;
    const ch = await guild.channels.fetch(id).catch(() => null);
    if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

async function applyVerification(member, cfg, { db, method = 'button', actor = null } = {}) {
    const guild = member.guild;
    if (cfg.roleId) {
        const role = guild.roles.cache.get(cfg.roleId);
        if (!role) throw new Error('Verified role not found');
        const me = guild.members.me;
        if (me && role.position >= me.roles.highest.position) {
            throw new Error('Verified role is higher than the bot role');
        }
        await member.roles.add(role, `EB verification (${method})`);
    }

    if (cfg.removeUnverifiedOnVerify && cfg.unverifiedRoleId) {
        await member.roles.remove(cfg.unverifiedRoleId, 'EB verification complete').catch(() => {});
    }

    for (const id of cfg.extraRoleIds || []) {
        if (id && id !== cfg.roleId) {
            await member.roles.add(id, 'EB verification extra role').catch(() => {});
        }
    }

    await clearPending(db, guild.id, member.id);

    const entry = {
        userId: member.id,
        username: member.user?.username || member.id,
        displayName: member.displayName || member.user?.username || member.id,
        avatar: member.user?.displayAvatarURL?.({ size: 64 }) || null,
        at: Date.now(),
        method,
        by: actor || member.user?.username || 'self',
    };
    await appendLog(db, guild.id, entry);

    const logEmbed = new EmbedBuilder()
        .setColor(cfg.embedColor || '#00fbff')
        .setTitle('✅ Member verified')
        .setDescription(`${member} is now verified.`)
        .addFields(
            { name: 'User', value: `${member.user?.tag || member.id}`, inline: true },
            { name: 'Method', value: method, inline: true },
            { name: 'By', value: String(actor || 'self'), inline: true },
        )
        .setTimestamp();
    const av = member.user?.displayAvatarURL?.();
    if (av) logEmbed.setThumbnail(av);
    await staffLog(guild, cfg, logEmbed);

    if (cfg.dmOnVerify && cfg.dmMessage) {
        await member.user.send(replaceVars(cfg.dmMessage, member, guild)).catch(() => {});
    }

    if (cfg.announceChannelId) {
        const ch = await guild.channels.fetch(cfg.announceChannelId).catch(() => null);
        if (ch) {
            const text = replaceVars(cfg.announceMessage || DEFAULTS.announceMessage, member, guild);
            const ping = cfg.pingStaffRoleId ? `<@&${cfg.pingStaffRoleId}> ` : '';
            await ch.send({ content: `${ping}${text}`.slice(0, 2000) }).catch(() => {});
        }
    }

    try {
        require('../../backend/src/websocket/socket').emitLog(guild.id, {
            type: 'member_verified',
            category: 'members',
            icon: '✅',
            title: 'Member Verified',
            description: `${member.user?.tag || member.id} verified (${method})`,
            guildId: guild.id,
        });
    } catch { /* socket optional */ }

    return entry;
}

async function revokeVerification(member, cfg, { db, actor = 'Dashboard' } = {}) {
    if (cfg.roleId) {
        await member.roles.remove(cfg.roleId, 'EB unverify').catch(() => {});
    }
    for (const id of cfg.extraRoleIds || []) {
        if (id && id !== cfg.roleId) {
            await member.roles.remove(id, 'EB unverify extra').catch(() => {});
        }
    }
    if (cfg.unverifiedRoleId) {
        await member.roles.add(cfg.unverifiedRoleId, 'EB unverify').catch(() => {});
    }
    await markPending(db, member.guild.id, member, cfg);

    const embed = new EmbedBuilder()
        .setColor('#FF5555')
        .setTitle('↩️ Verification revoked')
        .setDescription(`${member} was unverified by ${actor}.`)
        .setTimestamp();
    await staffLog(member.guild, cfg, embed);
}

async function handleJoin(member, db) {
    if (member.user?.bot) return { skipped: 'bot' };
    const cfg = await getConfig(db, member.guild.id);
    if (!cfg.enabled) return { skipped: 'disabled' };

    if (accountTooNew(member.user, cfg.minAccountAgeDays) && cfg.kickOnFail) {
        await member.kick(`Account younger than ${cfg.minAccountAgeDays} day(s)`).catch(() => {});
        await staffLog(member.guild, cfg, new EmbedBuilder()
            .setColor('#FF5555')
            .setTitle('⛔ Join blocked')
            .setDescription(`${member.user?.tag || member.id} was kicked — account too new.`)
            .setTimestamp());
        return { kicked: 'age' };
    }

    if (cfg.unverifiedRoleId) {
        await member.roles.add(cfg.unverifiedRoleId, 'EB unverified gate').catch(() => {});
    }
    await markPending(db, member.guild.id, member, cfg);
    return { pending: true };
}

async function handleVerifyClick(interaction, db) {
    const cfg = await getConfig(db, interaction.guildId);
    if (!cfg.enabled || !cfg.roleId) {
        return interaction.reply({
            content: '❌ Verification system is not set up.',
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
    }

    const member = interaction.member;
    if (cfg.denyBots && interaction.user.bot) {
        return interaction.reply({ content: 'Bots cannot verify.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }

    if (hasBypass(member, cfg) || isVerified(member, cfg)) {
        return interaction.reply({
            content: replaceVars(cfg.alreadyMessage, member, interaction.guild),
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
    }

    if (accountTooNew(interaction.user, cfg.minAccountAgeDays)) {
        const msg = `❌ Your Discord account must be at least **${cfg.minAccountAgeDays}** day(s) old.`;
        if (cfg.kickOnFail) {
            await interaction.reply({ content: msg + ' You will be removed.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            await member.kick(`Account younger than ${cfg.minAccountAgeDays} day(s)`).catch(() => {});
            return;
        }
        return interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }

    if (cfg.mode === 'captcha') {
        return sendCaptcha(interaction, cfg);
    }

    try {
        await applyVerification(member, cfg, { db, method: 'button' });
        return interaction.reply({
            content: replaceVars(cfg.successMessage, member, interaction.guild),
            flags: [MessageFlags.Ephemeral],
        });
    } catch (err) {
        logger.error('Verification apply failed', { error: err.message });
        return interaction.reply({
            content: replaceVars(cfg.failMessage, member, interaction.guild),
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
    }
}

function sendCaptcha(interaction) {
    const a = 2 + Math.floor(Math.random() * 12);
    const b = 2 + Math.floor(Math.random() * 12);
    const correct = a + b;
    const wrongs = new Set();
    while (wrongs.size < 2) {
        const n = correct + (Math.floor(Math.random() * 9) - 4);
        if (n !== correct && n > 0) wrongs.add(n);
    }
    const choices = [correct, ...wrongs].sort(() => Math.random() - 0.5);
    const row = new ActionRowBuilder().addComponents(
        choices.map((n) => new ButtonBuilder()
            .setCustomId(`verify_cap_${a}_${b}_${n}`)
            .setLabel(String(n))
            .setStyle(n === correct ? ButtonStyle.Primary : ButtonStyle.Secondary)),
    );
    return interaction.reply({
        content: `Solve to verify: **${a} + ${b} = ?**`,
        components: [row],
        flags: [MessageFlags.Ephemeral],
    }).catch(() => {});
}

async function handleCaptchaClick(interaction, db) {
    const parts = interaction.customId.split('_');
    // verify_cap_a_b_picked
    const a = Number(parts[2]);
    const b = Number(parts[3]);
    const picked = Number(parts[4]);
    const cfg = await getConfig(db, interaction.guildId);

    if (!Number.isFinite(a) || !Number.isFinite(b) || picked !== a + b) {
        return interaction.update({
            content: '❌ Wrong answer. Click **Verify** again and try once more.',
            components: [],
        }).catch(() => interaction.reply({
            content: '❌ Wrong answer. Click Verify again.',
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {}));
    }

    if (hasBypass(interaction.member, cfg) || isVerified(interaction.member, cfg)) {
        return interaction.update({
            content: replaceVars(cfg.alreadyMessage, interaction.member, interaction.guild),
            components: [],
        }).catch(() => {});
    }

    try {
        await applyVerification(interaction.member, cfg, { db, method: 'captcha' });
        return interaction.update({
            content: replaceVars(cfg.successMessage, interaction.member, interaction.guild),
            components: [],
        });
    } catch (err) {
        logger.error('Captcha verify failed', { error: err.message });
        return interaction.update({
            content: replaceVars(cfg.failMessage, interaction.member, interaction.guild),
            components: [],
        }).catch(() => {});
    }
}

async function kickOverdue(guild, db) {
    const cfg = await getConfig(db, guild.id);
    if (!cfg.enabled || !cfg.kickUnverifiedMinutes) return { kicked: 0 };
    const map = await getPendingMap(db, guild.id);
    const now = Date.now();
    let kicked = 0;
    for (const [userId, info] of Object.entries(map)) {
        if (!info?.kickAt || info.kickAt > now) continue;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
            if (isVerified(member, cfg) || hasBypass(member, cfg)) {
                delete map[userId];
                continue;
            }
            const ok = await member.kick('Did not verify in time').catch(() => null);
            if (ok) kicked += 1;
        }
        delete map[userId];
    }
    await setPendingMap(db, guild.id, map);
    return { kicked };
}

async function listPending(guild, db, cfg) {
    const map = await getPendingMap(db, guild.id);
    const fromDb = Object.values(map);
    if (cfg.unverifiedRoleId) {
        try {
            await guild.members.fetch();
            for (const member of guild.members.cache.values()) {
                if (member.user.bot) continue;
                if (!member.roles.cache.has(cfg.unverifiedRoleId)) continue;
                if (cfg.roleId && member.roles.cache.has(cfg.roleId)) continue;
                if (!map[member.id]) {
                    fromDb.push({
                        userId: member.id,
                        username: member.user.username,
                        displayName: member.displayName,
                        avatar: member.user.displayAvatarURL({ size: 64 }),
                        joinedAt: member.joinedTimestamp || Date.now(),
                        kickAt: null,
                    });
                }
            }
        } catch { /* ignore fetch errors */ }
    }
    return fromDb.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
}

async function createRoles(guild, { which = 'both', verifiedName = 'Verified', unverifiedName = 'Unverified' } = {}) {
    const created = {};
    const wantV = which === 'verified' || which === 'both';
    const wantU = which === 'unverified' || which === 'both';
    if (wantV) {
        const role = await guild.roles.create({
            name: String(verifiedName || 'Verified').slice(0, 100),
            color: 0x00fbff,
            reason: 'EB verification — verified role',
            mentionable: false,
        });
        created.verified = { id: role.id, name: role.name, color: role.hexColor };
    }
    if (wantU) {
        const role = await guild.roles.create({
            name: String(unverifiedName || 'Unverified').slice(0, 100),
            color: 0x6b7280,
            hoist: false,
            reason: 'EB verification — join / pending role',
            mentionable: false,
        });
        created.unverified = { id: role.id, name: role.name, color: role.hexColor };
    }
    return created;
}

async function applyGateLock(guild, cfg) {
    if (!cfg.unverifiedRoleId) throw new Error('Set an unverified role first');
    if (!cfg.channelId) throw new Error('Set a panel channel first');
    const locked = [];
    for (const ch of guild.channels.cache.values()) {
        if (![0, 2, 4, 5, 13, 15].includes(ch.type)) continue;
        if (!ch.permissionOverwrites) continue;
        if (ch.id === cfg.channelId) {
            await ch.permissionOverwrites.edit(cfg.unverifiedRoleId, {
                ViewChannel: true,
                SendMessages: false,
                AddReactions: false,
            }).catch(() => {});
            if (cfg.roleId) {
                await ch.permissionOverwrites.edit(cfg.roleId, { ViewChannel: true }).catch(() => {});
            }
            locked.push(ch.id);
            continue;
        }
        await ch.permissionOverwrites.edit(cfg.unverifiedRoleId, { ViewChannel: false }).catch(() => {});
        locked.push(ch.id);
    }
    return locked;
}

async function removeGateLock(guild, cfg) {
    if (!cfg.unverifiedRoleId) return [];
    const ids = (cfg.lockedChannelIds && cfg.lockedChannelIds.length)
        ? cfg.lockedChannelIds
        : [...guild.channels.cache.keys()];
    const cleared = [];
    for (const id of ids) {
        const ch = guild.channels.cache.get(id);
        if (!ch?.permissionOverwrites) continue;
        await ch.permissionOverwrites.delete(cfg.unverifiedRoleId).catch(() => {});
        cleared.push(id);
    }
    return cleared;
}

async function overview(guild, db) {
    const cfg = await getConfig(db, guild.id);
    const log = await getLog(db, guild.id);
    const pending = await listPending(guild, db, cfg);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return {
        config: cfg,
        stats: {
            enabled: cfg.enabled,
            mode: cfg.mode,
            verifiedToday: log.filter((e) => (e.at || 0) >= dayAgo).length,
            verifiedTotal: log.length,
            pending: pending.length,
            hasRole: !!cfg.roleId,
            hasChannel: !!(cfg.channelId || cfg.logChannelId),
            hasUnverified: !!cfg.unverifiedRoleId,
        },
        pending: pending.slice(0, 80),
        log: log.slice(0, 50),
    };
}

module.exports = {
    defaults,
    getConfig,
    saveConfig,
    getPendingMap,
    setPendingMap,
    markPending,
    clearPending,
    getLog,
    appendLog,
    clearLog,
    buildPanelPayload,
    postPanel,
    applyVerification,
    revokeVerification,
    handleJoin,
    handleVerifyClick,
    handleCaptchaClick,
    kickOverdue,
    listPending,
    overview,
    isVerified,
    hasBypass,
    createRoles,
    applyGateLock,
    removeGateLock,
    KEY,
};
