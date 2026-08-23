const assert = require('assert');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { storageConfig, normalizeAvatar } = require('../../shared/services/account-avatars');

(async () => {
    const old = { ...process.env };
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
    process.env.SUPABASE_AVATAR_BUCKET = 'avatars';
    assert.deepStrictEqual(storageConfig(), {
        baseUrl: 'https://project.supabase.co', serviceKey: 'test-only-key', bucket: 'avatars',
    });
    process.env.SUPABASE_URL = 'http://project.supabase.co';
    assert.strictEqual(storageConfig(), null, 'storage must require HTTPS');
    process.env.SUPABASE_URL = 'https://project.supabase.co';

    const source = createCanvas(800, 400);
    const context = source.getContext('2d');
    context.fillStyle = '#22d3ee'; context.fillRect(0, 0, 800, 400);
    const normalized = await normalizeAvatar(source.toBuffer('image/png'));
    assert(normalized.length > 100);
    const decoded = await loadImage(normalized);
    assert.strictEqual(decoded.width, 512);
    assert.strictEqual(decoded.height, 512);
    await assert.rejects(normalizeAvatar(Buffer.from('not an image')), /valid image|up to 2 MiB/);
    await assert.rejects(normalizeAvatar(Buffer.alloc(2 * 1024 * 1024 + 1)), /2 MiB/);

    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
    console.log('Account avatar validation tests passed.');
})().catch(err => { console.error(err); process.exit(1); });
