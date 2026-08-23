const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'support', 'system', 'discord', 'ebbot', 'root',
    'login', 'register', 'security', 'settings', 'profile', 'api',
]);

function normalizeDisplayName(value) {
    const displayName = String(value || '').normalize('NFKC').trim();
    return displayName.length >= 1 && displayName.length <= 64 ? displayName : null;
}

function normalizeLocalUsername(value) {
    const username = String(value || '').normalize('NFKC').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(username) || RESERVED_USERNAMES.has(username)) return null;
    return username;
}

function normalizeEmail(value) {
    const email = String(value || '').normalize('NFKC').trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

module.exports = { RESERVED_USERNAMES, normalizeDisplayName, normalizeLocalUsername, normalizeEmail };
