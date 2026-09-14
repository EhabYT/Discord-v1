const fs = require('fs');
const path = require('path');
const { WebhookClient, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../lib/logger');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const MAX_BACKUPS = 10;
const MAX_WEBHOOK_FILE_SIZE = 8 * 1024 * 1024; // 8MB Discord webhook limit

function getBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    return BACKUP_DIR;
}

function getWebhookUrl(guildId, db) {
    return db.get(`webhook_logs_${guildId}`);
}

async function performBackup(guildId, db) {
    const keys = [
        `settings_${guildId}`, `logging_${guildId}`, `welcome_${guildId}`, `verification_${guildId}`,
        `toggles_${guildId}`, `autoroles_${guildId}`, `ticket_config_${guildId}`, `tickets_${guildId}`,
        `automod_${guildId}`, `security_${guildId}`, `commands_enabled_${guildId}`, `xp_enabled_${guildId}`,
        `xp_multiplier_${guildId}`, `rewards_${guildId}`, `custom_filters_${guildId}`, `autoresponder_${guildId}`,
        `djrole_${guildId}`, `birthday_config_${guildId}`, `suggestion_config_${guildId}`, `suggestions_${guildId}`, `polls_${guildId}`,
        `tags_${guildId}`, `confession_config_${guildId}`, `confessions_${guildId}`, `announcements_${guildId}`,
    ];
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

function writeBackup(guildId, backup) {
    const dir = getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${guildId}_${timestamp}.json`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');
    pruneOldBackups(dir, guildId);
    logger.info(`Backup written for guild ${guildId}: ${filename}`);
    return filepath;
}

function pruneOldBackups(dir, guildId) {
    try {
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith(`backup_${guildId}_`) && f.endsWith('.json'))
            .sort();
        while (files.length > MAX_BACKUPS) {
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
        const backup = await performBackup(guildId, db);
        const filepath = writeBackup(guildId, backup);
        const uploaded = await uploadBackupToWebhook(guildId, db, filepath);
        return { filepath, uploaded };
    } catch (err) {
        logger.error(`Scheduled backup failed for guild ${guildId}`, { error: err.message });
        throw err;
    }
}

module.exports = { performBackup, writeBackup, uploadBackupToWebhook, scheduledBackup, getBackupDir, getWebhookUrl };
