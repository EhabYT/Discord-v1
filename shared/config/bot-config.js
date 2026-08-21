const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'bot.json');
const COLOR = /^#[0-9A-Fa-f]{6}$/;

function assert(condition, message) {
    if (!condition) throw new Error(`Invalid config/bot.json: ${message}`);
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
}

function onlyKeys(object, allowed, label) {
    assert(object && typeof object === 'object' && !Array.isArray(object), `${label} must be an object`);
    const extra = Object.keys(object).filter((key) => !allowed.includes(key));
    assert(extra.length === 0, `${label} contains unsupported keys: ${extra.join(', ')}`);
}

function validateBotConfig(input) {
    onlyKeys(input, ['$schema', 'schemaVersion', 'identity', 'colors', 'emojis', 'limits', 'automod'], 'root');
    assert(input.schemaVersion === 2, 'schemaVersion must be 2');
    onlyKeys(input.identity, ['name', 'shortName', 'product', 'version', 'defaultActivity'], 'identity');
    assert(input.identity?.name && input.identity?.version && input.identity?.defaultActivity,
        'identity.name, identity.version and identity.defaultActivity are required');
    assert(input.identity.defaultActivity.length <= 128, 'identity.defaultActivity exceeds Discord limit');
    const colorKeys = ['primary', 'secondary', 'success', 'warning', 'error', 'info', 'neutral'];
    onlyKeys(input.colors, colorKeys, 'colors');
    for (const key of colorKeys) {
        assert(COLOR.test(String(input.colors?.[key] || '')), `colors.${key} must be a six-digit hex color`);
    }
    for (const [key, value] of Object.entries(input.emojis || {})) {
        assert(typeof value === 'string' && value.length > 0 && value.length <= 32, `emojis.${key} is invalid`);
    }
    const limitMaximums = {
        warningHistory: 1000, queuePreview: 100, bulkModeration: 100,
        embedDescription: 4096, embedFields: 25,
    };
    onlyKeys(input.limits, Object.keys(limitMaximums), 'limits');
    for (const [key, maximum] of Object.entries(limitMaximums)) {
        const value = input.limits[key];
        assert(Number.isInteger(value) && value > 0 && value <= maximum,
            `limits.${key} must be between 1 and ${maximum}`);
    }
    onlyKeys(input.automod, ['profanity'], 'automod');
    const profanity = input.automod?.profanity;
    onlyKeys(profanity, ['matchMode', 'normalizeUnicode', 'normalizeLeetspeak', 'terms'], 'automod.profanity');
    assert(profanity?.matchMode === 'word', 'automod.profanity.matchMode must be word');
    assert(typeof profanity.normalizeUnicode === 'boolean' && typeof profanity.normalizeLeetspeak === 'boolean',
        'profanity normalization flags must be boolean');
    assert(Array.isArray(profanity.terms) && profanity.terms.length > 0, 'automod.profanity.terms is required');
    const normalizedTerms = profanity.terms.map((term) => String(term).trim().toLowerCase());
    assert(normalizedTerms.every((term) => term.length >= 2 && term.length <= 64), 'profanity terms must be 2-64 characters');
    assert(new Set(normalizedTerms).size === normalizedTerms.length, 'profanity terms must be unique');
    profanity.terms = normalizedTerms;
    return deepFreeze(input);
}

function loadBotConfig(file = CONFIG_PATH) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (err) { throw new Error(`Could not read config/bot.json: ${err.message}`); }
    return validateBotConfig(parsed);
}

const LEET = Object.freeze({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' });
function normalizedWords(text, options = {}) {
    let value = String(text || '').toLowerCase();
    if (options.normalizeUnicode !== false) value = value.normalize('NFKD').replace(/\p{M}/gu, '');
    if (options.normalizeLeetspeak !== false) value = [...value].map((char) => LEET[char] || char).join('');
    return value.match(/[\p{L}\p{N}]+/gu) || [];
}

function containsProfanity(text, profanityConfig = config.automod.profanity) {
    const terms = new Set(profanityConfig.terms);
    return normalizedWords(text, profanityConfig).some((word) => terms.has(word));
}

const config = loadBotConfig();

module.exports = { config, loadBotConfig, validateBotConfig, containsProfanity, normalizedWords, CONFIG_PATH };
