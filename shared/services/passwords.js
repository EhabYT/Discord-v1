const argon2 = require('argon2');

const COMMON = new Set(['password', 'password123', '123456789012345', 'qwertyuiopasdfgh', 'letmeinletmeinletmein']);
const OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
};

function validatePassword(password) {
    if (typeof password !== 'string') return 'Password is required';
    if (password.length < 15) return 'Password must be at least 15 characters';
    if (password.length > 128) return 'Password must be at most 128 characters';
    if (COMMON.has(password.normalize('NFKC').toLowerCase())) return 'Choose a less common password';
    return null;
}

function hashPassword(password) {
    const issue = validatePassword(password);
    if (issue) throw Object.assign(new Error(issue), { code: 'PASSWORD_POLICY' });
    return argon2.hash(password, OPTIONS);
}

async function verifyPassword(hash, password) {
    try { return await argon2.verify(hash, String(password || ''), OPTIONS); }
    catch { return false; }
}

module.exports = { OPTIONS, validatePassword, hashPassword, verifyPassword };
