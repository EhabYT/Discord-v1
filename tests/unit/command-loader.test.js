const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const errors = [];
const warnings = [];

function load(rel) {
    return require(path.join(root, rel));
}

const commandsPath = path.join(root, 'bot', 'src', 'commands');
const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
const names = new Set();
const cmds = [];

for (const file of files) {
    try {
        const cmd = load(path.join('bot', 'src', 'commands', file));
        if (!cmd.data || !cmd.execute) {
            errors.push([file, 'missing data or execute']);
            continue;
        }
        const json = cmd.data.toJSON();
        if (names.has(json.name)) errors.push([file, `duplicate name: ${json.name}`]);
        names.add(json.name);
        if (json.name.length < 1 || json.name.length > 32) errors.push([file, 'invalid name length']);
        if (!json.description || json.description.length > 100) {
            errors.push([file, `bad description length ${json.description && json.description.length}`]);
        }
        cmds.push({ file, name: json.name, json, defer: !!cmd.defer });
    } catch (e) {
        errors.push([file, e.message]);
    }
}

function walkOpts(file, opts, prefix = '') {
    for (const o of opts || []) {
        if ((o.description || '').length > 100) {
            errors.push([file, `option desc too long: ${prefix}${o.name}`]);
        }
        if (o.name && o.name.length > 32) errors.push([file, `option name too long: ${o.name}`]);
        if (o.options) walkOpts(file, o.options, `${o.name}.`);
    }
}
for (const c of cmds) walkOpts(c.file, c.json.options);

const evDir = path.join(root, 'bot', 'src', 'events');
for (const file of fs.readdirSync(evDir).filter(f => f.endsWith('.js') && f !== 'index.js')) {
    try {
        const ev = load(path.join('bot', 'src', 'events', file));
        const list = Array.isArray(ev) ? ev : [ev];
        for (const e of list) {
            if (!e.name) errors.push([file, 'event missing name']);
            if (typeof e.execute !== 'function') errors.push([file, 'event missing execute']);
        }
    } catch (e) {
        errors.push([file, e.message]);
    }
}
for (const file of fs.readdirSync(path.join(evDir, 'player')).filter(f => f.endsWith('.js'))) {
    try {
        const ev = load(path.join('bot', 'src', 'events', 'player', file));
        if (!ev.name || typeof ev.execute !== 'function') errors.push(['player/' + file, 'invalid']);
    } catch (e) {
        errors.push(['player/' + file, e.message]);
    }
}

for (const file of fs.readdirSync(path.join(root, 'shared', 'services')).filter(f => f.endsWith('.js'))) {
    try { load(path.join('shared', 'services', file)); }
    catch (e) { errors.push(['shared/services/' + file, e.message]); }
}

const dashFiles = [
    'backend/src/server.js',
    'backend/src/websocket/socket.js',
    'backend/src/routes/auth.js',
    'backend/src/routes/guilds.js',
    'backend/src/routes/music.js',
    'backend/src/routes/stats.js',
    'backend/src/routes/permissions.js',
    'backend/src/middleware/permissions.js',
    'bot/src/scheduler.js',
    'shared/lib/logger.js',
];
for (const f of dashFiles) {
    try { load(f); }
    catch (e) { errors.push([f, e.message]); }
}

const { PermissionFlagsBits } = require('discord.js');
if (!PermissionFlagsBits.ManageGuildExpressions) {
    warnings.push('ManageGuildExpressions missing — steal.js may fail');
}

const helpers = load('shared/utils/discord.js');
for (const fn of ['safeReply', 'hasModPerms', 'checkDJPerms', 'parseTimeString', 'formatDuration', 'getGuildQueue']) {
    if (typeof helpers[fn] !== 'function') errors.push(['helpers', `missing ${fn}`]);
}

// parseTimeString sanity
if (helpers.parseTimeString('10m') !== 600000) errors.push(['helpers', 'parseTimeString 10m']);
if (helpers.parseTimeString('bad') !== null) errors.push(['helpers', 'parseTimeString bad']);

const snipe = load('shared/services/snipe.js');
snipe.setDelete('c1', { content: 'hi', tag: 'a#0' });
if (!snipe.getDelete('c1')) errors.push(['snipe', 'delete cache miss']);
snipe.setEdit('c1', { before: 'a', after: 'b', tag: 'a#0' });
if (!snipe.getEdit('c1')) errors.push(['snipe', 'edit cache miss']);

console.log(JSON.stringify({
    commands: cmds.length,
    names: [...names].sort(),
    errors,
    warnings,
}, null, 2));
process.exit(errors.length ? 1 : 0);
