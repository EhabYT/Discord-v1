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

const BIO_MAX_LENGTH = 160;

// Bio is optional free text. `undefined` means "not provided" (leave the
// stored value unchanged); `null`/'' clears it; anything longer than
// BIO_MAX_LENGTH is rejected with `null` so routes can answer 400.
function normalizeBio(value) {
    if (value === undefined) return undefined;
    if (value === null) return '';
    const bio = String(value).normalize('NFKC').trim();
    return bio.length <= BIO_MAX_LENGTH ? bio : null;
}

const PREFERENCE_THEMES = ['light', 'dark', 'system'];
const PREFERENCE_LANGUAGES = ['en', 'ar', 'de', 'fr', 'es', 'tr'];
const DEFAULT_PREFERENCES = Object.freeze({
    theme: 'dark',
    language: 'en',
    timeZone: '',
    notifications: Object.freeze({ email: true, push: true, marketing: false }),
});

function normalizeTimeZone(value) {
    const zone = String(value || '').trim().slice(0, 64);
    if (!zone) return '';
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return zone;
    } catch {
        return null;
    }
}

function normalizeNotifications(value, base) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const current = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    const pick = (key, fallback) => {
        if (typeof raw[key] === 'boolean') return raw[key];
        if (typeof current[key] === 'boolean') return current[key];
        return fallback;
    };
    return {
        email: pick('email', DEFAULT_PREFERENCES.notifications.email),
        push: pick('push', DEFAULT_PREFERENCES.notifications.push),
        marketing: pick('marketing', DEFAULT_PREFERENCES.notifications.marketing),
    };
}

// Merge-and-sanitize for PUT /api/account/preferences. Absent keys keep the
// stored value, unknown keys are dropped. Returns `null` only when the
// timezone names a zone ICU does not know, so routes can answer 400.
function normalizePreferences(value, base) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const current = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    const pick = (key, allowed, fallback) => {
        if (raw[key] === undefined || raw[key] === null) {
            return allowed.includes(current[key]) ? current[key] : fallback;
        }
        return allowed.includes(raw[key]) ? raw[key] : fallback;
    };
    const timeZone = raw.timeZone === undefined || raw.timeZone === null || raw.timeZone === ''
        ? (typeof current.timeZone === 'string' ? current.timeZone : DEFAULT_PREFERENCES.timeZone)
        : normalizeTimeZone(raw.timeZone);
    if (timeZone === null) return null;
    return {
        theme: pick('theme', PREFERENCE_THEMES, DEFAULT_PREFERENCES.theme),
        language: pick('language', PREFERENCE_LANGUAGES, DEFAULT_PREFERENCES.language),
        timeZone,
        notifications: normalizeNotifications(raw.notifications, current.notifications),
    };
}

module.exports = {
    RESERVED_USERNAMES, normalizeDisplayName, normalizeLocalUsername, normalizeEmail,
    BIO_MAX_LENGTH, normalizeBio,
    PREFERENCE_THEMES, PREFERENCE_LANGUAGES, DEFAULT_PREFERENCES,
    normalizeTimeZone, normalizeNotifications, normalizePreferences,
};
