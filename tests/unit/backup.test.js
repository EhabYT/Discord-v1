const fs = require('fs');
const path = require('path');
const { performBackup, writeBackup, getBackupDir, getWebhookUrl } = require('eb-bot-shared/services/backup');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

const BACKUP_DIR = getBackupDir();

// Mock database
const mockDb = {
    data: new Map(),
    async get(key) { return this.data.get(key) || null; },
    async set(key, value) { this.data.set(key, value); return value; },
};

// Seed mock data
const GUILD_ID = '123456789012345678';
mockDb.data.set(`settings_${GUILD_ID}`, { prefix: '!', welcome: true });
mockDb.data.set(`logging_${GUILD_ID}`, { channel: '111' });
mockDb.data.set(`automod_${GUILD_ID}`, { enabled: true });
mockDb.data.set(`webhook_logs_${GUILD_ID}`, 'https://discord.com/api/webhooks/test/test');

(async () => {
    console.log('\nBackup module checks:\n');

    // Test getBackupDir returns a valid path
    check('getBackupDir returns a string path', typeof BACKUP_DIR === 'string' && BACKUP_DIR.length > 0);
    check('backups directory exists', fs.existsSync(BACKUP_DIR));

    // Test performBackup collects correct keys
    const backup = await performBackup(GUILD_ID, mockDb);
    check('performBackup returns an object', typeof backup === 'object' && backup !== null);
    check('performBackup includes settings key', `settings_${GUILD_ID}` in backup);
    check('performBackup includes logging key', `logging_${GUILD_ID}` in backup);
    check('performBackup includes automod key', `automod_${GUILD_ID}` in backup);
    check('performBackup includes _meta', typeof backup._meta === 'object' && backup._meta !== null);
    check('_meta includes guildId', backup._meta?.guildId === GUILD_ID);
    check('_meta includes exportedAt', typeof backup._meta?.exportedAt === 'string');
    check('_meta includes botVersion', typeof backup._meta?.botVersion === 'string');

    // Test writeBackup creates a file
    const filepath = await writeBackup(GUILD_ID, backup);
    check('writeBackup returns a file path', typeof filepath === 'string' && filepath.length > 0);
    check('backup file exists', fs.existsSync(filepath));
    check('backup file is valid JSON', (() => {
        try { JSON.parse(fs.readFileSync(filepath, 'utf8')); return true; } catch { return false; }
    })());
    check('backup filename matches guild ID', path.basename(filepath).includes(GUILD_ID));

    // Test getWebhookUrl reads from db
    const url = await getWebhookUrl(GUILD_ID, mockDb);
    check('getWebhookUrl returns configured URL', url === 'https://discord.com/api/webhooks/test/test');

    // Test getWebhookUrl returns null for unconfigured guild
    const noUrl = await getWebhookUrl('999999999999999999', mockDb);
    check('getWebhookUrl returns null for missing guild', noUrl === null);

    // Test pruneOldBackups (create multiple backups and check count)
    for (let i = 0; i < 12; i++) {
        await writeBackup(GUILD_ID, { ...backup, _extra: i });
    }
    const newCount = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`backup_${GUILD_ID}_`));
    check('pruneOldBackups keeps max 10 backups per guild', newCount.length <= 10);

    // Test pruneOldBackups directly with a different guild
    const PRUNE_GUILD = '111111111111111111';
    for (let i = 0; i < 15; i++) {
        await writeBackup(PRUNE_GUILD, { ...backup, _extra: i });
    }
    const pruneCount = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`backup_${PRUNE_GUILD}_`));
    check('pruneOldBackups direct call keeps max 10', pruneCount.length <= 10);

    // Test pruneOldBackups ignores other guilds
    const otherGuildCount = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`backup_${GUILD_ID}_`));
    check('pruneOldBackups does not affect other guilds', otherGuildCount.length <= 10);

    // Cleanup test files
    try {
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`backup_${GUILD_ID}_`));
        for (const f of files) fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch { /* ignore */ }

    console.log(fails === 0 ? '\nAll backup checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
