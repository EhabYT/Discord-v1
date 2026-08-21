const fs = require('fs');
const path = require('path');
const express = require('express');
const { isLoopback } = require('../middleware/auth');
const { databaseConfigIssue } = require('../../../database/index');

const ROOT = path.join(__dirname, '..', '..', '..');
const ENV_FILE = path.join(ROOT, '.env');
const ALLOWED_KEYS = new Set([
    'DISCORD_TOKEN', 'CLIENT_ID', 'DISCORD_CLIENT_SECRET',
    'DATABASE_URL', 'DATABASE_POOL_SIZE', 'DATABASE_SSL', 'DATABASE_SSL_REJECT_UNAUTHORIZED',
    'SESSION_SECRET', 'DEV_TOKEN', 'OWNER_ID', 'DEVELOPER_IDS', 'SUPPORT_IDS', 'GUILD_ID',
    'DASHBOARD_URL', 'DISCORD_REDIRECT_URI', 'DASHBOARD_AUTH', 'DASHBOARD_SECURE',
    'DEPLOY_COMMANDS', 'SYNC_GLOBAL_COMMANDS', 'LOG_LEVEL', 'SUPPORT_INVITE',
]);
const SECRET_KEYS = new Set([
    'DISCORD_TOKEN', 'DISCORD_CLIENT_SECRET', 'DATABASE_URL', 'SESSION_SECRET', 'DEV_TOKEN',
]);

function localSetupOnly(req, res, next) {
    // Never expose a credential-writing endpoint on Render, through a tunnel,
    // or behind any forwarding proxy. Production returns 404 so the endpoint
    // cannot be discovered and brute-forced.
    if (process.env.NODE_ENV === 'production' || !isLoopback(req)) {
        return res.status(404).type('text').send('Not found');
    }
    return next();
}

function validateUpdates(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Expected an object of environment values');
    }
    const clean = {};
    for (const [key, raw] of Object.entries(input)) {
        if (!ALLOWED_KEYS.has(key)) throw new Error(`Unsupported environment key: ${key}`);
        if (typeof raw !== 'string') throw new Error(`${key} must be a string`);
        const value = raw.trim();
        if (!value) continue; // blank fields leave the current value untouched
        if (value.length > 4096 || /[\r\n\0]/.test(value)) throw new Error(`Invalid value for ${key}`);
        clean[key] = value;
    }
    if (clean.CLIENT_ID && !/^\d{17,20}$/.test(clean.CLIENT_ID)) {
        throw new Error('CLIENT_ID must be a Discord Application ID');
    }
    for (const key of ['OWNER_ID', 'GUILD_ID']) {
        if (clean[key] && !/^\d{17,20}$/.test(clean[key])) throw new Error(`${key} must be a Discord ID`);
    }
    for (const key of ['DEVELOPER_IDS', 'SUPPORT_IDS']) {
        if (!clean[key]) continue;
        const ids = clean[key].split(',').map((id) => id.trim()).filter(Boolean);
        if (!ids.length || ids.some((id) => !/^\d{17,20}$/.test(id))) {
            throw new Error(`${key} must contain comma-separated Discord IDs`);
        }
    }
    if (clean.DATABASE_URL) {
        const issue = databaseConfigIssue(clean.DATABASE_URL);
        if (issue) throw new Error(issue);
    }
    for (const key of ['DASHBOARD_URL', 'DISCORD_REDIRECT_URI']) {
        if (!clean[key]) continue;
        let parsed;
        try { parsed = new URL(clean[key]); } catch { throw new Error(`${key} must be a valid URL`); }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${key} must use HTTP(S)`);
    }
    return clean;
}

function writeEnv(updates, envFile = ENV_FILE) {
    const clean = validateUpdates(updates);
    if (!Object.keys(clean).length) return [];
    if (fs.existsSync(envFile) && fs.lstatSync(envFile).isSymbolicLink()) {
        throw new Error('Refusing to overwrite a symbolic link');
    }
    const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/) : [];
    const written = new Set();
    const lines = existing.map((line) => {
        const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
        if (!match || !Object.prototype.hasOwnProperty.call(clean, match[1])) return line;
        const key = match[1];
        written.add(key);
        return `${key}=${JSON.stringify(clean[key])}`;
    });
    for (const [key, value] of Object.entries(clean)) {
        if (!written.has(key)) lines.push(`${key}=${JSON.stringify(value)}`);
    }
    const temp = `${envFile}.tmp-${process.pid}`;
    fs.writeFileSync(temp, `${lines.filter((line, i, arr) => line || i < arr.length - 1).join('\n')}\n`, { mode: 0o600 });
    fs.renameSync(temp, envFile);
    try { fs.chmodSync(envFile, 0o600); } catch { /* Windows/non-POSIX */ }
    return Object.keys(clean);
}

function statusPayload() {
    const configured = {};
    for (const key of ALLOWED_KEYS) configured[key] = !!String(process.env[key] || '').trim();
    return {
        localEditorAvailable: process.env.NODE_ENV !== 'production',
        configured,
        databaseIssue: databaseConfigIssue(),
        restartRequiredAfterSave: true,
    };
}

function setupPage() {
    const fields = [
        ['CLIENT_ID', 'Discord Application ID', 'text'],
        ['DISCORD_TOKEN', 'Discord Bot Token', 'password'],
        ['DISCORD_CLIENT_SECRET', 'Discord OAuth Client Secret', 'password'],
        ['DATABASE_URL', 'Supabase Session Pooler URI', 'password'],
        ['SESSION_SECRET', 'Session signing secret', 'password'],
        ['DEV_TOKEN', 'Developer access token', 'password'],
        ['OWNER_ID', 'Discord owner user ID', 'text'],
        ['DEVELOPER_IDS', 'Developer user IDs (comma-separated)', 'text'],
        ['SUPPORT_IDS', 'Support user IDs (comma-separated)', 'text'],
        ['DASHBOARD_URL', 'Dashboard public URL', 'url'],
        ['DISCORD_REDIRECT_URI', 'Discord redirect URI', 'url'],
    ];
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EB Bot local setup</title><style>
body{margin:0;background:#05070b;color:#e5e7eb;font:14px system-ui;min-height:100vh}.wrap{max-width:720px;margin:auto;padding:32px 20px}h1{color:#67e8f9}p{color:#9ca3af;line-height:1.5}.card{background:#0b0e14;border:1px solid #ffffff18;border-radius:16px;padding:20px}label{display:block;margin:14px 0 6px;color:#d4d4d8;font-weight:600}input{box-sizing:border-box;width:100%;padding:11px;border-radius:10px;border:1px solid #ffffff20;background:#111827;color:white}button{margin-top:20px;padding:11px 18px;border:0;border-radius:10px;background:#67e8f9;color:#06252a;font-weight:800;cursor:pointer}#msg{margin-top:14px;white-space:pre-wrap}.warn{color:#fbbf24}
</style></head><body><div class="wrap"><h1>EB Bot local environment setup</h1><p class="warn">Available only from direct localhost in development. It is intentionally disabled on Render and through tunnels.</p><div class="card"><form id="form">${fields.map(([key, label, type]) => `<label for="${key}">${label}</label><input id="${key}" name="${key}" type="${type}" autocomplete="off" placeholder="Leave blank to keep current value">`).join('')}<button type="submit">Save .env</button><div id="msg"></div></form></div></div><script>
const form=document.getElementById('form'),msg=document.getElementById('msg');form.addEventListener('submit',async(e)=>{e.preventDefault();msg.textContent='Saving…';const values={};for(const el of form.elements){if(el.name&&el.value.trim())values[el.name]=el.value.trim()}try{const r=await fetch('/setup/env',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Save failed');msg.textContent='Saved: '+d.updated.join(', ')+'\nRestart the process to apply changes.';form.reset()}catch(err){msg.textContent='Error: '+err.message}});
</script></body></html>`;
}

module.exports = () => {
    const router = express.Router();
    router.use(localSetupOnly);
    router.get('/', (_req, res) => res.type('html').send(setupPage()));
    router.get('/status', (_req, res) => res.json(statusPayload()));
    router.post('/env', (req, res) => {
        try {
            const updated = writeEnv(req.body);
            return res.json({ ok: true, updated, restartRequired: true });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
    });
    return router;
};

module.exports.validateUpdates = validateUpdates;
module.exports.writeEnv = writeEnv;
module.exports.statusPayload = statusPayload;
module.exports.ALLOWED_KEYS = ALLOWED_KEYS;
module.exports.SECRET_KEYS = SECRET_KEYS;
