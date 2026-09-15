const crypto = require('crypto');
const QRCode = require('qrcode');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encryptionKey() {
    const raw = String(process.env.ACCOUNT_ENCRYPTION_KEY || '').trim();
    let key;
    if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
    else {
        try { key = Buffer.from(raw, 'base64'); } catch { key = null; }
    }
    if (!key || key.length !== 32) throw Object.assign(new Error('MFA encryption is not configured'), { code: 'MFA_UNAVAILABLE' });
    return key;
}

function base32Encode(buffer) {
    let bits = 0; let value = 0; let output = '';
    for (const byte of buffer) {
        value = (value << 8) | byte; bits += 8;
        while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(input) {
    let bits = 0; let value = 0; const bytes = [];
    for (const char of String(input).toUpperCase().replace(/=|\s|-/g, '')) {
        const index = BASE32.indexOf(char);
        if (index < 0) throw new Error('Invalid base32 secret');
        value = (value << 5) | index; bits += 5;
        if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Buffer.from(bytes);
}

function generateSecret() { return base32Encode(crypto.randomBytes(20)); }

function encryptSecret(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    cipher.setAAD(Buffer.from('eb-account-totp-v1'));
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return { ciphertext: encrypted.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptSecret(record) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
    decipher.setAAD(Buffer.from('eb-account-totp-v1'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function totpAt(secret, step) {
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return String(value).padStart(6, '0');
}

function verifyTotp(secret, code, now = Date.now(), window = 1) {
    const supplied = Buffer.from(String(code || '').replace(/\s/g, ''));
    if (supplied.length !== 6 || !/^\d{6}$/.test(supplied.toString())) return null;
    const current = Math.floor(now / 30_000);
    for (let offset = -window; offset <= window; offset++) {
        const step = current + offset;
        const expected = Buffer.from(totpAt(secret, step));
        if (crypto.timingSafeEqual(supplied, expected)) return step;
    }
    return null;
}

function recoveryHash(code) {
    return crypto.createHmac('sha256', encryptionKey())
        .update('eb-recovery-v1\0').update(String(code).toUpperCase().replace(/\s/g, '')).digest('hex');
}

function generateRecoveryCodes(count = 10) {
    return Array.from({ length: count }, () => {
        const raw = crypto.randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(12, 'X').slice(0, 12);
        return `EB-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    });
}

function otpauthUri(account, secret) {
    const issuer = 'EB Dashboard';
    const label = `${issuer}:${account.email || account.username}`;
    return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function enrollmentPayload(account) {
    const secret = generateSecret();
    const uri = otpauthUri(account, secret);
    return { secret, encrypted: encryptSecret(secret), uri, qrDataUrl: await QRCode.toDataURL(uri, { width: 240, margin: 1, errorCorrectionLevel: 'M' }) };
}

module.exports = {
    encryptionKey, base32Encode, base32Decode, generateSecret, encryptSecret,
    decryptSecret, totpAt, verifyTotp, recoveryHash, generateRecoveryCodes,
    otpauthUri, enrollmentPayload,
};
