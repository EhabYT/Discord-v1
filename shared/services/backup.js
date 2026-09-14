const fs = require('fs');
const path = require('path');
const { WebhookClient, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../lib/logger');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
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

module.exports = { performBackup, writeBackup, uploadBackupToWebhook, scheduledBackup, getBackupDir, getWebhookUrl, pruneOldBackups, getBackupConfig, saveBackupConfig, DEFAULT_KEYS };
