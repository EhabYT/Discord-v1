/**
 * Role-hierarchy diagnosis for CMD use.
 *
 * Prints every guild role with its position, marks the bot's own top role,
 * and flags which roles the bot can (or cannot) manage. Discord only allows
 * a bot to manage roles STRICTLY below its own highest role, and only with
 * the Manage Roles permission — both must be fixed in
 * Server Settings → Roles, never from here.
 *
 * Usage:
 *   node scripts/diagnose-roles.js [guildId]
 *
 * Without an argument all guilds of the bot are checked. Prints IDs and
 * positions only — never tokens or secrets.
 */
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
    process.exit(1);
}

const HEADERS = { Authorization: `Bot ${TOKEN}`, 'User-Agent': 'EB-Bot-diagnose-roles/1.0' };

async function api(path) {
    const res = await fetch(`https://discord.com/api/v10${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Discord API ${res.status} for ${path}`);
    return res.json();
}

(async () => {
    const onlyGuild = process.argv[2] || null;
    const guilds = onlyGuild
        ? [{ id: onlyGuild }]
        : await api('/users/@me/guilds');
    for (const guild of guilds) {
        const full = await api(`/guilds/${guild.id}`);
        const roles = await api(`/guilds/${guild.id}/roles`);
        const me = await api(`/guilds/${guild.id}/members/${CLIENT_ID}`);
        const byId = new Map(roles.map((r) => [r.id, r]));
        const myRoles = (me.roles || []).map((id) => byId.get(id)).filter(Boolean);
        const myTop = myRoles.length ? Math.max(...myRoles.map((r) => r.position)) : -1;
        const botRole = myRoles.find((r) => r.position === myTop);
        const canManageRoles = botRole
            ? (BigInt(botRole.permissions) & (1n << 28n)) !== 0n
            : false;
        console.log(`\n== ${full.name || guild.id} (${guild.id}) ==`);
        console.log(`Bot top role: ${botRole ? `${botRole.name} @${myTop}` : '(none)'} | Manage Roles: ${canManageRoles ? 'ON' : 'OFF'}`);
        if (!canManageRoles) {
            console.log('FIX: Server Settings → Roles → bot role → enable "Manage Roles".');
        }
        for (const role of [...roles].sort((a, b) => b.position - a.position)) {
            const tag = role.position >= myTop ? 'BLOCKED ' : 'ok      ';
            const mine = role.position === myTop && botRole && role.id === botRole.id ? '  <-- bot' : '';
            console.log(`${tag} pos=${String(role.position).padStart(2)} ${role.name}${mine}`);
        }
    }
    process.exit(0);
})().catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
});
