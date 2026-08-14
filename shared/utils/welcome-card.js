const { createCanvas, loadImage } = require('@napi-rs/canvas');
const https = require('https');

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const u = url.replace(/webp$/, 'png');
        https.get(u, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetchBuffer(res.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function generateWelcomeCard({ username, displayName, avatarURL, memberCount, guildName, accentColor = '#00FFFF' }) {
    const W = 800, H = 250;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── Background ────────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#060910');
    bg.addColorStop(0.5, '#0d1220');
    bg.addColorStop(1,   '#060910');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, W, H, 16);
    ctx.fill();

    // Scanline grid
    ctx.strokeStyle = 'rgba(0,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 36) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 36) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Left glow aura
    const leftGlow = ctx.createRadialGradient(125, 125, 40, 125, 125, 160);
    leftGlow.addColorStop(0, `${accentColor}22`);
    leftGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, 290, H);

    // Border
    ctx.strokeStyle = `${accentColor}30`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 0, 0, W, H, 16);
    ctx.stroke();

    // Accent top strip
    const strip = ctx.createLinearGradient(0, 0, W, 0);
    strip.addColorStop(0, accentColor);
    strip.addColorStop(0.5, `${accentColor}80`);
    strip.addColorStop(1, 'transparent');
    ctx.fillStyle = strip;
    ctx.fillRect(0, 0, W, 3);

    // ── Avatar ────────────────────────────────────────────────────────────────
    const AX = 125, AY = 125, AR = 72;

    // Outer pulsing ring
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Second ring
    ctx.strokeStyle = `${accentColor}35`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 14, 0, Math.PI * 2);
    ctx.stroke();

    // Avatar clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.clip();
    try {
        const buf = await fetchBuffer(avatarURL + '?size=256');
        const img = await loadImage(buf);
        ctx.drawImage(img, AX - AR, AY - AR, AR * 2, AR * 2);
    } catch {
        ctx.fillStyle = '#1a1f2e';
        ctx.fill();
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 52px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((displayName || username)[0].toUpperCase(), AX, AY);
    }
    ctx.restore();

    // ── Text panel ────────────────────────────────────────────────────────────
    const TX = 240;

    // "WELCOME" label
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '4px';
    ctx.fillText('WELCOME', TX, 72);
    ctx.restore();

    // Divider under WELCOME
    const divGrad = ctx.createLinearGradient(TX, 0, TX + 220, 0);
    divGrad.addColorStop(0, `${accentColor}80`);
    divGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = divGrad;
    ctx.fillRect(TX, 78, 220, 1);

    // Display name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    let dName = displayName || username;
    while (ctx.measureText(dName).width > 490 && dName.length > 1) dName = dName.slice(0, -1);
    if (dName !== (displayName || username)) dName += '…';
    ctx.fillText(dName, TX, 122);

    // Username tag
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px sans-serif';
    ctx.fillText(`@${username}`, TX, 148);

    // Guild name
    ctx.fillStyle = '#9ca3af';
    ctx.font = '15px sans-serif';
    ctx.fillText(`to ${guildName}`, TX, 172);

    // Member count badge
    const badgeText = `Member #${memberCount.toLocaleString()}`;
    ctx.font = 'bold 13px sans-serif';
    const bW = ctx.measureText(badgeText).width + 24;
    const bX = TX, bY = 188;

    ctx.fillStyle = `${accentColor}15`;
    ctx.strokeStyle = `${accentColor}50`;
    ctx.lineWidth = 1;
    roundRect(ctx, bX, bY, bW, 26, 6);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 6;
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bX + bW / 2, bY + 13);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeCard };
