const assert = require('assert');
const {
    base32Encode, base32Decode, encryptSecret, decryptSecret, totpAt, verifyTotp,
    recoveryHash, generateRecoveryCodes, enrollmentPayload,
} = require('../../shared/services/account-mfa');

function restoreKey(value) {
    if (value === undefined) delete process.env.ACCOUNT_ENCRYPTION_KEY;
    else process.env.ACCOUNT_ENCRYPTION_KEY = value;
}

(async () => {
    const oldKey = process.env.ACCOUNT_ENCRYPTION_KEY;
    process.env.ACCOUNT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const raw = Buffer.from('12345678901234567890');
    const encoded = base32Encode(raw);
    assert.deepStrictEqual(base32Decode(encoded), raw);
    assert.strictEqual(totpAt(encoded, 1), '287082', 'RFC 6238 SHA-1 vector truncated to 6 digits');
    assert.strictEqual(verifyTotp(encoded, '287082', 59_000, 0), 1);
    assert.strictEqual(verifyTotp(encoded, '000000', 59_000, 0), null);

    const encrypted = encryptSecret(encoded);
    assert(!encrypted.ciphertext.includes(encoded));
    assert.strictEqual(decryptSecret(encrypted), encoded);
    const codes = generateRecoveryCodes();
    assert.strictEqual(codes.length, 10);
    assert.strictEqual(new Set(codes).size, 10);
    assert(codes.every(code => /^EB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)));
    assert.strictEqual(recoveryHash(codes[0]).length, 64);
    assert.notStrictEqual(recoveryHash(codes[0]), recoveryHash(codes[1]));

    const enrollment = await enrollmentPayload({ username: 'tester', email: 'test@example.com' });
    assert(enrollment.uri.startsWith('otpauth://totp/'));
    assert(enrollment.qrDataUrl.startsWith('data:image/png;base64,'));
    assert.strictEqual(decryptSecret(enrollment.encrypted), enrollment.secret);

    restoreKey(oldKey);
    console.log('Account MFA cryptography tests passed.');
})().catch(err => { console.error(err); process.exit(1); });
