const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebhookClient, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../lib/logger');

/**
 * Verify incoming webhook signature using HMAC-SHA256.
 * @param {string} payload - Raw request body
 * @param {string} signature - Signature from header
 * @param {string} secret - Webhook secret
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(payload, signature, secret) {
    if (!secret || !signature) return false;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    try {
        return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    } catch {
        return false;
    }
}

const BACKUP_DIR = path.join(__dirname, '..', '..', '..', 'backups');
const MAX_WEBHOOK_FILE_SIZE = 8 * 1024 * 1024; // 8MB Discord webhook limit

const DEFAULT_KEYS = [
    'settings', 'logging', 'welcome', 'verification',
    'toggles', 'autoroles', 'ticket_config', 'tickets',
    'automod', 'security', 'commands_enabled', 'xp_enabled',
    'xp_multiplier', 'rewards', 'custom_filters', 'autoresponder',
    'djrole', 'birthday_config', 'suggestion_config', 'suggestions', 'polls',
    'tags', 'confession_config', 'confessions', 'announcements',
];
const DEFAULT_MAX_BACKUPS = 10;

function getBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    return BACKUP_DIR;
}

function getWebhookUrl(guildId, db) {
    return db.get(`webhook_logs_${guildId}`);
}

async function getBackupConfig(guildId, db) {
    const raw = await db.get(`backup_config_${guildId}`);
    return {
        enabled: raw?.enabled !== false,
        intervalHours: Math.max(1, Math.min(72, Number(raw?.intervalHours) || 6)),
        maxBackups: Math.max(1, Math.min(50, Number(raw?.maxBackups) || DEFAULT_MAX_BACKUPS)),
        keys: Array.isArray(raw?.keys) ? raw.keys : DEFAULT_KEYS,
    };
}

async function saveBackupConfig(guildId, db, config) {
    const existing = await getBackupConfig(guildId, db);
    const merged = { ...existing, ...config };
    if (merged.keys && !Array.isArray(merged.keys)) merged.keys = DEFAULT_KEYS;
    await db.set(`backup_config_${guildId}`, merged);
    return merged;
}

async function performBackup(guildId, db) {
    const config = await getBackupConfig(guildId, db);
    const keys = (config.keys || DEFAULT_KEYS).map(k => `${k}_${guildId}`);
    const backup = {};
    for (const key of keys) {
        backup[key] = await db.get(key);
    }
    backup._meta = {
        guildId,
        exportedAt: new Date().toISOString(),
        botVersion: process.env.npm_package_version || '3.1.0',
    };
    // Generate integrity checksum
    backup._meta.checksum = generateChecksum(
        { ...backup, _meta: { ...backup._meta, checksum: undefined } },
        guildId
    );
    return backup;
}

function writeBackup(guildId, backup, maxBackups = DEFAULT_MAX_BACKUPS) {
    const dir = getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${guildId}_${timestamp}.json`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');
    pruneOldBackups(dir, guildId, maxBackups);
    logger.info(`Backup written for guild ${guildId}: ${filename}`);
    return filepath;
}

function pruneOldBackups(dir, guildId, max = DEFAULT_MAX_BACKUPS) {
    try {
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith(`backup_${guildId}_`) && f.endsWith('.json'))
            .sort();
        while (files.length > max) {
            const oldest = files.shift();
            fs.unlinkSync(path.join(dir, oldest));
            logger.debug(`Pruned old backup: ${oldest}`);
        }
    } catch { /* ignore */ }
}

async function uploadBackupToWebhook(guildId, db, filepath) {
    const url = await getWebhookUrl(guildId, db);
    if (!url) return false;
    try {
        const backup = await performBackup(guildId, db);
        const webhook = new WebhookClient({ url });
        const embed = new EmbedBuilder()
            .setColor(0x00fbff)
            .setTitle('📦 Server Backup')
            .setDescription(`Automatic backup exported for **${guildId}**.\nGenerated: ${backup._meta?.exportedAt || new Date().toISOString()}`)
            .setTimestamp()
            .setFooter({ text: 'EB Bot Backup' });

        const sendOptions = { embeds: [embed] };

        // Attach the backup file if filepath is provided and under size limit
        if (filepath && fs.existsSync(filepath)) {
            const stat = fs.statSync(filepath);
            if (stat.size <= MAX_WEBHOOK_FILE_SIZE) {
                const attachment = new AttachmentBuilder(filepath, {
                    name: path.basename(filepath),
                });
                sendOptions.files = [attachment];
                embed.addFields({ name: '📁 File', value: `\`${path.basename(filepath)}\` (${(stat.size / 1024).toFixed(1)} KB)` });
            } else {
                embed.addFields({ name: '⚠️ File', value: `Backup too large for Discord (${(stat.size / 1024 / 1024).toFixed(1)} MB). Check backups/ directory.` });
            }
        }

        await webhook.send(sendOptions);
        logger.info(`Backup webhook uploaded for guild ${guildId}`);
        return true;
    } catch (err) {
        logger.error(`Backup webhook upload failed for guild ${guildId}`, { error: err.message });
        return false;
    }
}

async function scheduledBackup(guildId, client, db) {
    try {
        const config = await getBackupConfig(guildId, db);
        if (!config.enabled) return null;
        const backup = await performBackup(guildId, db);
        const filepath = writeBackup(guildId, backup, config.maxBackups);
        const uploaded = await uploadBackupToWebhook(guildId, db, filepath);
        return { filepath, uploaded };
    } catch (err) {
        logger.error(`Scheduled backup failed for guild ${guildId}`, { error: err.message });
        throw err;
    }
}

/**
 * Generate a checksum for backup integrity verification.
 * Uses HMAC-SHA256 with a key derived from the guild ID.
 */
function generateChecksum(backup, guildId) {
    const data = JSON.stringify(backup);
    const key = crypto.createHash('sha256').update(`eb-backup-v1\0${guildId}`).digest('hex');
    return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Verify backup integrity by checking the checksum.
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyChecksum(backup, expectedChecksum, guildId) {
    if (!backup || typeof backup !== 'object') {
        return { valid: false, error: 'Invalid backup data' };
    }

    const actualChecksum = generateChecksum(backup, guildId);
    if (actualChecksum !== expectedChecksum) {
        return { valid: false, error: 'Backup integrity check failed — data may be corrupted or tampered with' };
    }

    return { valid: true };
}

/**
 * Validate backup structure and content before restore.
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateBackupStructure(backup, guildId) {
    const errors = [];

    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
        return { valid: false, errors: ['Backup must be a JSON object'] };
    }

    // Check for forbidden keys (prototype pollution)
    const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
    for (const key of Object.keys(backup)) {
        if (FORBIDDEN.has(key)) {
            errors.push(`Forbidden key: ${key}`);
        }
    }

    // Validate _meta if present
    if (backup._meta) {
        if (typeof backup._meta !== 'object') {
            errors.push('_meta must be an object');
        } else {
            if (backup._meta.guildId && backup._meta.guildId !== guildId) {
                errors.push('Backup belongs to a different server');
            }
        }
    }

    // Validate all values are JSON-serializable
    for (const [key, value] of Object.entries(backup)) {
        if (FORBIDDEN.has(key)) continue;
        try {
            JSON.parse(JSON.stringify(value));
        } catch {
            errors.push(`Key "${key}" contains non-serializable data`);
        }
    }

    // Check key count limit
    const keyCount = Object.keys(backup).filter(k => !FORBIDDEN.has(k)).length;
    if (keyCount > 100) {
        errors.push('Backup contains too many keys');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Sanitize backup data before restore.
 * Removes forbidden keys, validates guild ownership.
 */
function sanitizeBackup(backup, guildId) {
    const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
    const sanitized = {};

    for (const [key, value] of Object.entries(backup)) {
        if (FORBIDDEN.has(key)) continue;
        // Only restore keys belonging to this guild
        if (key.endsWith(`_${guildId}`) && typeof value !== 'undefined') {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

module.exports = {
    performBackup,
    writeBackup,
    uploadBackupToWebhook,
    scheduledBackup,
    getBackupDir,
    getWebhookUrl,
    pruneOldBackups,
    getBackupConfig,
    saveBackupConfig,
    generateChecksum,
    verifyChecksum,
    validateBackupStructure,
    sanitizeBackup,
    verifyWebhookSignature,
    DEFAULT_KEYS,
};
