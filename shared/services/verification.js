const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
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

function getRoleProblem(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return { role: null, error: 'Verified role not found (was it deleted? Ask an admin to pick a new one in Dashboard → Verification)', code: 'NOT_FOUND' };
    if (role.id === guild.id) {
        return { role, error: '@everyone cannot be used as the verified role', code: 'EVERYONE' };
    }
    if (role.managed) {
        return { role, error: `**${role.name}** is managed by an integration (bot/boost) and cannot be assigned by anyone`, code: 'MANAGED_ROLE' };
    }
    const me = guild.members.me;
    if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return { role, error: `I don't have the **Manage Roles** permission, so I can't assign **${role.name}**`, code: 'NO_PERMS' };
    }
    if (me && role.position >= me.roles.highest.position) {
        return { role, error: `I cannot manage **${role.name}** — move the bot role above it in Server Settings → Roles`, code: 'HIERARCHY' };
    }
    return { role, error: null, code: null };
}

function assertRoleManageable(guild, roleId) {
    const { role, error, code } = getRoleProblem(guild, roleId);
    if (error) {
        const err = new Error(error);
        err.code = code;
        if (role) err.roleName = role.name;
        throw err;
    }
    return role;
}

function isConfigured(cfg) {
    return !!(cfg && cfg.enabled && cfg.roleId);
}

function setupProblem(cfg, guild) {
    if (!cfg || !cfg.roleId) {
        return { code: 'NOT_SETUP', message: '❌ Verification is not set up yet. An admin needs to pick a verified role in Dashboard → Verification (Quick tab) or run /setupverification.' };
    }
    if (guild && cfg.roleId && !guild.roles.cache.has(cfg.roleId)) {
        return { code: 'NOT_FOUND', message: '❌ The configured verified role was deleted. An admin needs to pick a new one in Dashboard → Verification.' };
    }
    if (!cfg.enabled) {
        return { code: 'DISABLED', message: '❌ Verification is currently disabled. An admin can turn it on in Dashboard → Verification → Setup.' };
    }
    return null;
}

const ACTIONABLE_CODES = new Set(['HIERARCHY', 'NO_PERMS', 'MANAGED_ROLE', 'EVERYONE', 'NOT_FOUND']);

function describeDiscordFailure(err, role) {
    const name = role?.name ? `**${role.name}**` : 'the verified role';
    const code = typeof err?.code === 'number' ? err.code : null;
    if (code === 50013) {
        const e = new Error(`I can't assign ${name} — check that I have the **Manage Roles** permission and my role is above it in Server Settings → Roles`);
        e.code = 'HIERARCHY';
        e.discordCode = code;
        e.status = err?.status;
        return e;
    }
    if (code === 50001) {
        const e = new Error(`I can't access ${name} — check my permissions and role position in Server Settings → Roles`);
        e.code = 'NO_PERMS';
        e.discordCode = code;
        e.status = err?.status;
        return e;
    }
    if (code === 10011) {
        const e = new Error('The configured verified role was deleted. An admin needs to pick a new one in Dashboard → Verification.');
        e.code = 'NOT_FOUND';
        e.discordCode = code;
        return e;
    }
    if (code === 10007) {
        const e = new Error('I could not find you as a server member. Try leaving and rejoining, then verify again.');
        e.code = 'NOT_FOUND';
        e.discordCode = code;
        return e;
    }
    if (code !== null) {
        const e = new Error(`Discord rejected the role change (code ${code}). Please try again and contact staff if it persists.`);
        e.code = `DISCORD_${code}`;
        e.discordCode = code;
        e.status = err?.status;
        e.expose = true;
        return e;
    }
    return err;
}

function toActionableReply(err, cfg, member, guild) {
    if (err && ACTIONABLE_CODES.has(err.code)) return `❌ ${err.message}`;
    if (typeof err?.code === 'number') {
        const role = guild?.roles?.cache?.get(cfg.roleId);
        return `❌ ${describeDiscordFailure(err, role).message}`;
    }
    return replaceVars(cfg.failMessage, member, guild);
}

async function postPanel(guild, cfg, channelId) {
    const channel = guild.channels.cache.get(channelId || cfg.channelId);
    if (!channel) throw new Error('Channel not found');
    if (cfg.roleId) {
        assertRoleManageable(guild, cfg.roleId);
    }
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
        let me = guild.members.me;
        if (!me && typeof guild.members.fetchMe === 'function') {
            try { me = await guild.members.fetchMe(); } catch { me = null; }
        }
        const role = assertRoleManageable(guild, cfg.roleId);
        try {
            await member.roles.add(role, `EB verification (${method})`);
        } catch (err) {
            throw describeDiscordFailure(err, role);
        }
    }

    if (cfg.removeUnverifiedOnVerify && cfg.unverifiedRoleId) {
        await member.roles.remove(cfg.unverifiedRoleId, 'EB verification complete').catch(() => {});
    }

    for (const id of cfg.extraRoleIds || []) {
        if (id && id !== cfg.roleId) {
            await member.roles.add(id, 'EB verification extra role').catch(() => {});
        }
    }

    // Bookkeeping must never turn a granted role into a "failed" reply.
    // If the DB is down the member is still verified; log and continue.
    try {
        await clearPending(db, guild.id, member.id);
    } catch (err) {
        logger.warn('Verification pending cleanup failed', { error: err?.message, guild: guild.id, user: member.id });
    }

    const entry = {
        userId: member.id,
        username: member.user?.username || member.id,
        displayName: member.displayName || member.user?.username || member.id,
        avatar: member.user?.displayAvatarURL?.({ size: 64 }) || null,
        at: Date.now(),
        method,
        by: actor || member.user?.username || 'self',
    };
    try {
        await appendLog(db, guild.id, entry);
    } catch (err) {
        logger.warn('Verification log append failed', { error: err?.message, guild: guild.id, user: member.id });
    }

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
        require('eb-bot-backend').emitLog(guild.id, {
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

async function resolveClickMember(interaction) {
    const cached = interaction.member;
    try {
        const fresh = await interaction.guild?.members?.fetch(interaction.user.id);
        if (fresh) return fresh;
    } catch { /* fall back to cached member */ }
    return cached;
}

async function handleVerifyClick(interaction, db) {
    const cfg = await getConfig(db, interaction.guildId);
    const problem = setupProblem(cfg, interaction.guild);
    if (problem) {
        return interaction.reply({
            content: problem.message,
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
    }

    let member = await resolveClickMember(interaction);
    if (!member?.roles) {
        return interaction.reply({
            content: '❌ I could not find you as a server member. Try leaving and rejoining, then verify again.',
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {});
    }
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
        logger.error('Verification apply failed', {
            error: err?.message, code: err?.code, discordCode: err?.discordCode,
            guild: interaction.guildId, user: interaction.user?.id, roleId: cfg.roleId,
        });
        return interaction.reply({
            content: toActionableReply(err, cfg, member, interaction.guild),
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
    const problem = setupProblem(cfg, interaction.guild);
    if (problem) {
        return interaction.update({
            content: problem.message,
            components: [],
        }).catch(() => interaction.reply({
            content: problem.message,
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {}));
    }

    if (!Number.isFinite(a) || !Number.isFinite(b) || picked !== a + b) {
        return interaction.update({
            content: '❌ Wrong answer. Click **Verify** again and try once more.',
            components: [],
        }).catch(() => interaction.reply({
            content: '❌ Wrong answer. Click Verify again.',
            flags: [MessageFlags.Ephemeral],
        }).catch(() => {}));
    }

    let captchaMember = await resolveClickMember(interaction);
    if (!captchaMember?.roles) {
        return interaction.update({
            content: '❌ I could not find you as a server member. Try leaving and rejoining, then verify again.',
            components: [],
        }).catch(() => {});
    }

    if (hasBypass(captchaMember, cfg) || isVerified(captchaMember, cfg)) {
        return interaction.update({
            content: replaceVars(cfg.alreadyMessage, captchaMember, interaction.guild),
            components: [],
        }).catch(() => {});
    }

    try {
        await applyVerification(captchaMember, cfg, { db, method: 'captcha' });
        return interaction.update({
            content: replaceVars(cfg.successMessage, captchaMember, interaction.guild),
            components: [],
        });
    } catch (err) {
        logger.error('Captcha verify failed', {
            error: err?.message, code: err?.code, discordCode: err?.discordCode,
            guild: interaction.guildId, user: interaction.user?.id, roleId: cfg.roleId,
        });
        return interaction.update({
            content: toActionableReply(err, cfg, captchaMember, interaction.guild),
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
            colors: { primaryColor: 0x00fbff },
            reason: 'EB verification — verified role',
            mentionable: false,
        });
        created.verified = { id: role.id, name: role.name, color: role.hexColor };
    }
    if (wantU) {
        const role = await guild.roles.create({
            name: String(unverifiedName || 'Unverified').slice(0, 100),
            colors: { primaryColor: 0x6b7280 },
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

async function fixHierarchy(guild, db) {
    const cfg = await getConfig(db, guild.id);
    const me = guild.members.me;
    if (!me) {
        const err = new Error('Bot member not found in guild cache — try again in a moment.');
        err.code = 'NO_BOT_MEMBER';
        throw err;
    }
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        const err = new Error('I do not have the **Manage Roles** permission, so I cannot move or recreate roles. Grant it in Server Settings → Roles.');
        err.code = 'NO_PERMS';
        throw err;
    }
    const _botTop = me.roles.highest.position;
    const targets = [];
    if (cfg.roleId) {
        const prob = getRoleProblem(guild, cfg.roleId);
        if (prob.code === 'HIERARCHY') targets.push({ key: 'roleId', role: prob.role, id: cfg.roleId });
    }
    if (cfg.unverifiedRoleId) {
        const prob = getRoleProblem(guild, cfg.unverifiedRoleId);
        if (prob.code === 'HIERARCHY') targets.push({ key: 'unverifiedRoleId', role: prob.role, id: cfg.unverifiedRoleId });
    }
    for (const id of cfg.extraRoleIds || []) {
        if (!id) continue;
        const prob = getRoleProblem(guild, id);
        if (prob.code === 'HIERARCHY') targets.push({ key: 'extraRoleIds', role: prob.role, id });
    }
    if (targets.length === 0) {
        return { fixed: [], config: cfg, message: 'All verification roles are already below the bot.' };
    }
    const fixed = [];
    const idToNew = new Map();
    for (const t of targets) {
        if (idToNew.has(t.id)) {
            // Same physical role appears in multiple config slots (e.g. verified + extra).
            // Reuse the clone we already created instead of making a second duplicate.
            const reused = idToNew.get(t.id);
            if (t.key === 'extraRoleIds') {
                cfg.extraRoleIds = (cfg.extraRoleIds || []).map((x) => (x === t.id ? reused : x));
            } else if (t.key === 'roleId') cfg.roleId = reused;
            else if (t.key === 'unverifiedRoleId') cfg.unverifiedRoleId = reused;
            continue;
        }
        let role = t.role;
        let moved = false;
        // Try to move the existing role just below the bot's top role.
        try {
            const targetPos = Math.max(1, guild.members.me.roles.highest.position - 1);
            if (typeof role.setPosition === 'function') {
                await role.setPosition(targetPos, { reason: 'EB auto-fix: move role below bot so Verify can assign it' });
            } else if (typeof role.edit === 'function') {
                await role.edit({ position: targetPos }, 'EB auto-fix: move role below bot');
            } else {
                throw new Error('no position API');
            }
            const after = guild.roles.cache.get(role.id);
            const curBotTop = guild.members.me.roles.highest.position;
            if (after && after.position < curBotTop) {
                moved = true;
                idToNew.set(t.id, t.id);
                fixed.push({ roleId: role.id, name: role.name, method: 'moved', position: after.position });
                continue;
            }
        } catch (_) {
            // fall through to recreate clone
        }
        if (!moved) {
            // Discord does not allow a bot to move a role that is already above it (Missing Permissions 50013).
            // Clone the role at the bottom of the list, which will be below the bot in the common case, and swap config.
            try {
                const clone = await guild.roles.create({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    permissions: role.permissions?.bitfield ?? 0n,
                    mentionable: role.mentionable,
                    reason: 'EB auto-fix: recreate role below bot (original was above bot)',
                });
                // Best-effort nudge the clone just below the bot's top role.
                try {
                    const newBotTop = guild.members.me.roles.highest.position;
                    if (clone.position >= newBotTop && typeof clone.setPosition === 'function') {
                        await clone.setPosition(Math.max(1, newBotTop - 1)).catch(() => {});
                    }
                } catch { /* ignore nudge failure */ }
                if (t.key === 'roleId') cfg.roleId = clone.id;
                else if (t.key === 'unverifiedRoleId') cfg.unverifiedRoleId = clone.id;
                else if (t.key === 'extraRoleIds') {
                    cfg.extraRoleIds = (cfg.extraRoleIds || []).map((x) => (x === t.id ? clone.id : x));
                }
                idToNew.set(t.id, clone.id);
                fixed.push({
                    roleId: role.id,
                    newRoleId: clone.id,
                    name: role.name,
                    method: 'recreated',
                    note: `Created new "${clone.name}" below the bot. Delete the old "${role.name}" manually when ready.`,
                });
            } catch (err) {
                const e = new Error(`Could not move or recreate **${role.name}**: ${err.message}. Move the bot role above it manually in Server Settings → Roles.`);
                e.code = 'FIX_FAILED';
                e.roleName = role.name;
                throw e;
            }
        }
    }
    if (fixed.length) await saveConfig(db, guild.id, cfg);
    return { fixed, config: cfg };
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
    fixHierarchy,
    getRoleProblem,
    assertRoleManageable,
    isConfigured,
    setupProblem,
    describeDiscordFailure,
    toActionableReply,
    KEY,
};
