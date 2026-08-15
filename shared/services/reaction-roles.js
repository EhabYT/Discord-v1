const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { randomUUID } = require('crypto');
const logger = require('../lib/logger');

const KEY = (guildId) => `reactionroles_${guildId}`;

function nid() {
    return randomUUID().split('-')[0];
}

function normalize(list) {
    return (Array.isArray(list) ? list : []).map((r, i) => ({
        id: r.id || `legacy-${i}-${String(r.messageId || '').slice(-4)}`,
        messageId: r.messageId || null,
        channelId: r.channelId || null,
        emoji: r.emoji || '',
        roleId: r.roleId,
        mode: ['add', 'remove', 'toggle'].includes(r.mode) ? r.mode : 'toggle',
        style: r.style === 'button' ? 'button' : 'reaction',
        label: String(r.label || '').slice(0, 80),
        group: String(r.group || '').slice(0, 40),
        createdAt: r.createdAt || 0,
    }));
}

async function list(db, guildId) {
    return normalize(await db.get(KEY(guildId)) || []);
}

async function save(db, guildId, mappings) {
    const next = normalize(mappings).slice(0, 80);
    await db.set(KEY(guildId), next);
    return next;
}

function emojiMatches(stored, reaction) {
    if (!stored) return false;
    const unicode = reaction.emoji.name;
    const mention = reaction.emoji.id
        ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : unicode;
    return stored === unicode || stored === mention || stored === reaction.emoji.toString();
}

async function applyMapping(member, mapping, adding, all) {
    const role = member.guild.roles.cache.get(mapping.roleId);
    if (!role) throw new Error('Role not found');
    const me = member.guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
        throw new Error('Role is higher than the bot');
    }
    const mode = mapping.mode || 'toggle';
    const has = member.roles.cache.has(role.id);

    if (adding) {
        if (mode === 'remove') return { action: 'skip' };
        if (mapping.group) {
            const siblings = (all || []).filter((m) => m.group === mapping.group && m.roleId !== mapping.roleId);
            for (const s of siblings) {
                if (member.roles.cache.has(s.roleId)) {
                    await member.roles.remove(s.roleId, 'Reaction role exclusive group').catch(() => {});
                }
            }
        }
        if (!has) await member.roles.add(role, 'Reaction / button role');
        return { action: 'add', roleId: role.id, name: role.name };
    }

    if (mode === 'add') return { action: 'skip' };
    if (has) await member.roles.remove(role, 'Reaction / button role');
    return { action: 'remove', roleId: role.id, name: role.name };
}

function findForReaction(list, messageId, reaction) {
    return list.find((r) => r.style !== 'button' && r.messageId === messageId && emojiMatches(r.emoji, reaction));
}

async function handleButton(interaction, db) {
    const id = interaction.customId.slice('rr_btn_'.length);
    const mappings = await list(db, interaction.guildId);
    const mapping = mappings.find((m) => m.id === id);
    if (!mapping) {
        return interaction.reply({ content: '❌ This role button is no longer set up.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
    const member = interaction.member;
    const has = member.roles.cache.has(mapping.roleId);
    try {
        const result = await applyMapping(member, mapping, !has, mappings);
        if (result.action === 'add') {
            return interaction.reply({ content: `✅ Added **${result.name}**.`, flags: [MessageFlags.Ephemeral] });
        }
        if (result.action === 'remove') {
            return interaction.reply({ content: `↩️ Removed **${result.name}**.`, flags: [MessageFlags.Ephemeral] });
        }
        return interaction.reply({ content: 'Nothing to change.', flags: [MessageFlags.Ephemeral] });
    } catch (err) {
        logger.error('Button role failed', { error: err.message });
        return interaction.reply({ content: `❌ ${err.message}`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
}

function buildButtonRows(mappings) {
    const buttons = mappings.filter((m) => m.roleId).slice(0, 25).map((m) => {
        const btn = new ButtonBuilder()
            .setCustomId(`rr_btn_${m.id}`)
            .setLabel((m.label || 'Role').slice(0, 80))
            .setStyle(ButtonStyle.Secondary);
        if (m.emoji) {
            try { btn.setEmoji(m.emoji); } catch { /* ignore */ }
        }
        return btn;
    });
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return rows;
}

function buildEmbed(guild, { title, description, color, mappings }) {
    const lines = (mappings || []).map((m) => {
        const bit = m.emoji ? `${m.emoji} ` : '';
        return `${bit}<@&${m.roleId}>${m.group ? ` · \`${m.group}\`` : ''}`;
    }).join('\n');
    const embed = new EmbedBuilder()
        .setColor(/^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#00fbff')
        .setTitle(String(title || 'Pick your roles').slice(0, 256))
        .setDescription([description || 'Click a button or react to get a role.', lines].filter(Boolean).join('\n\n').slice(0, 4096))
        .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined });
    return embed;
}

async function postPanel(guild, db, opts) {
    const channel = guild.channels.cache.get(opts.channelId);
    if (!channel) throw new Error('Channel not found');
    const incoming = (opts.roles || []).filter((r) => r.roleId).slice(0, 20);
    if (!incoming.length) throw new Error('Add at least one role');

    const style = opts.style === 'button' ? 'button' : 'reaction';
    const mappings = incoming.map((r) => ({
        id: nid(),
        emoji: r.emoji || '',
        roleId: r.roleId,
        mode: r.mode || 'toggle',
        style,
        label: r.label || guild.roles.cache.get(r.roleId)?.name || 'Role',
        group: opts.unique ? (opts.group || 'panel') : (r.group || ''),
        channelId: channel.id,
        createdAt: Date.now(),
    }));

    const embed = buildEmbed(guild, {
        title: opts.title,
        description: opts.description,
        color: opts.color,
        mappings,
    });
    const payload = { embeds: [embed] };
    if (style === 'button') payload.components = buildButtonRows(mappings);

    const sent = await channel.send(payload);
    for (const m of mappings) m.messageId = sent.id;

    if (style === 'reaction') {
        for (const m of mappings) {
            if (m.emoji) await sent.react(m.emoji).catch(() => {});
        }
    }

    const existing = await list(db, guild.id);
    const next = await save(db, guild.id, [...existing, ...mappings]);
    return { messageId: sent.id, channelId: channel.id, added: mappings.length, mappings: next };
}

module.exports = {
    KEY,
    normalize,
    list,
    save,
    applyMapping,
    findForReaction,
    handleButton,
    postPanel,
    nid,
};
