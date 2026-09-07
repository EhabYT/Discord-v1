/**
 * Shared welcome/goodbye template variables.
 *
 * One implementation for the join message, the join embed, the join DM, the
 * leave message, and the dashboard test endpoint — previously four separate
 * inline replace chains that drifted apart (leave missed {userName}, the test
 * endpoint missed new tokens, ...).
 *
 * Supported tokens (both styles, so ProBot-style templates work verbatim):
 *
 *   {user} [user]               member mention
 *   {userName} [userName]       username without mention
 *   {guild} [server]            server name
 *   {count} [memberCount]       current member count
 *   {inviter} [inviter]         inviter mention, or 'Unknown'
 *   {inviterName} [inviterName] inviter name, or 'Unknown'
 */

function formatWelcomeVars(template, { member = null, guild = null, inviter = null } = {}) {
    if (typeof template !== 'string' || !template) return template;
    const resolvedGuild = guild || member?.guild || {};
    const user = member?.user || {};
    const values = {
        user: member?.id ? `<@${member.id}>` : 'Someone',
        userName: user.username || user.tag || 'Someone',
        guild: resolvedGuild.name || 'this server',
        count: String(resolvedGuild.memberCount ?? ''),
        inviter: inviter?.id ? `<@${inviter.id}>` : 'Unknown',
        inviterName: inviter?.username || inviter?.tag || 'Unknown',
    };
    const tokens = {
        user: ['{user}', '[user]'],
        userName: ['{userName}', '[userName]'],
        guild: ['{guild}', '[server]'],
        count: ['{count}', '[memberCount]'],
        inviter: ['{inviter}', '[inviter]'],
        inviterName: ['{inviterName}', '[inviterName]'],
    };
    let out = template;
    for (const [key, spellings] of Object.entries(tokens)) {
        for (const spelling of spellings) {
            if (out.includes(spelling)) out = out.split(spelling).join(values[key]);
        }
    }
    return out;
}

module.exports = { formatWelcomeVars };
