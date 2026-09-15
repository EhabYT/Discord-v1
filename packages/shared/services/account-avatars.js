const crypto = require('crypto');
const axios = require('axios');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

function storageConfig() {
    const baseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const bucket = String(process.env.SUPABASE_AVATAR_BUCKET || 'avatars').trim();
    try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !serviceKey || !/^[a-z0-9_-]{1,63}$/i.test(bucket)) return null;
        return { baseUrl: parsed.origin, serviceKey, bucket };
    } catch { return null; }
}

async function normalizeAvatar(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.length > 2 * 1024 * 1024) {
        throw Object.assign(new Error('Avatar must be an image up to 2 MiB'), { code: 'AVATAR_INVALID' });
    }
    let image;
    try { image = await loadImage(buffer); }
    catch { throw Object.assign(new Error('Avatar is not a valid image'), { code: 'AVATAR_INVALID' }); }
    if (!image.width || !image.height || image.width > 4096 || image.height > 4096
        || image.width * image.height > 16_000_000) {
        throw Object.assign(new Error('Avatar dimensions are too large'), { code: 'AVATAR_INVALID' });
    }
    const size = Math.min(image.width, image.height);
    const sourceX = Math.floor((image.width - size) / 2);
    const sourceY = Math.floor((image.height - size) / 2);
    const canvas = createCanvas(512, 512);
    const context = canvas.getContext('2d');
    context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 512, 512);
    return canvas.toBuffer('image/png');
}

async function uploadAvatar(accountId, normalizedBuffer) {
    const config = storageConfig();
    if (!config) throw Object.assign(new Error('Avatar storage is not configured'), { code: 'AVATAR_STORAGE_UNAVAILABLE' });
    const objectKey = `${accountId}/${crypto.randomUUID()}.png`;
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    await axios.post(`${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedKey}`, normalizedBuffer, {
        headers: {
            Authorization: `Bearer ${config.serviceKey}`,
            apikey: config.serviceKey,
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'x-upsert': 'false',
        },
        maxBodyLength: 600_000,
        timeout: 15_000,
    });
    return {
        objectKey,
        publicUrl: `${config.baseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodedKey}`,
    };
}

async function deleteAvatar(objectKey) {
    const config = storageConfig();
    if (!config || !objectKey) return false;
    await axios.delete(`${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}`, {
        headers: { Authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey },
        data: { prefixes: [objectKey] },
        timeout: 10_000,
    });
    return true;
}

module.exports = { storageConfig, normalizeAvatar, uploadAvatar, deleteAvatar };
