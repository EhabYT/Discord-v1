const assert = require('assert');
const { OPTIONS, validatePassword, hashPassword, verifyPassword } = require('../../shared/services/passwords');
const { validateRegistration } = require('../../backend/src/routes/account-auth');

(async () => {
    assert.strictEqual(OPTIONS.memoryCost, 19 * 1024);
    assert.strictEqual(OPTIONS.timeCost, 2);
    assert.strictEqual(OPTIONS.parallelism, 1);
    assert.match(validatePassword('short'), /15 characters/);
    assert.match(validatePassword('password123'), /15 characters|common/);
    assert.strictEqual(validatePassword('correct horse battery staple'), null);
    const hash = await hashPassword('correct horse battery staple');
    assert(hash.startsWith('$argon2id$'));
    assert.strictEqual(await verifyPassword(hash, 'correct horse battery staple'), true);
    assert.strictEqual(await verifyPassword(hash, 'wrong password value'), false);

    const valid = validateRegistration({
        displayName: 'Example User', username: 'example_user', email: 'USER@example.com',
        password: 'correct horse battery staple', confirmPassword: 'correct horse battery staple',
    });
    assert.deepStrictEqual(valid, { displayName: 'Example User', username: 'example_user', email: 'user@example.com' });
    assert.match(validateRegistration({ ...valid, password: 'short', confirmPassword: 'short' }).error, /15 characters/);
    assert.match(validateRegistration({ ...valid, username: 'admin', password: 'correct horse battery staple', confirmPassword: 'correct horse battery staple' }).error, /reserved/);
    assert.match(validateRegistration({ ...valid, email: 'bad', password: 'correct horse battery staple', confirmPassword: 'correct horse battery staple' }).error, /valid email/);

    console.log('Password and registration policy tests passed.');
})().catch(err => { console.error(err); process.exit(1); });
