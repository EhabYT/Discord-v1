const { createCanvas, loadImage } = require('@napi-rs/canvas');
const https = require('https');

// ── Helpers ──────────────────────────────────────────────────────────────────
function fetchImageBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url.replace('webp', 'png'), res => {
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

// ── Main generator ────────────────────────────────────────────────────────────
async function generateRankCard({
    username, displayName, avatarURL,
    level, xp, xpNeeded, rank, totalUsers,
    accentColor = '#00FFFF',
}) {
    const W = 934, H = 282;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── Background ────────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0B0E14');
    bg.addColorStop(1, '#131820');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, W, H, 18);
    ctx.fill();

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(0,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Glow panel behind avatar
    const glow = ctx.createRadialGradient(141, 141, 60, 141, 141, 130);
    glow.addColorStop(0, `${accentColor}18`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 300, H);

    // ── Avatar ────────────────────────────────────────────────────────────────
    const AX = 141, AY = 141, AR = 84;

    // Outer glow ring
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner ring
    ctx.strokeStyle = `${accentColor}50`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 12, 0, Math.PI * 2);
    ctx.stroke();

    // Clip + draw avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.clip();
    try {
        const buf = await fetchImageBuffer(avatarURL + '?size=256');
        const img = await loadImage(buf);
        ctx.drawImage(img, AX - AR, AY - AR, AR * 2, AR * 2);
    } catch {
        ctx.fillStyle = '#1a1f2e';
        ctx.fill();
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 60px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((displayName || username)[0].toUpperCase(), AX, AY);
    }
    ctx.restore();

    // ── Rank badge (top-left of avatar) ──────────────────────────────────────
    const badgeX = AX - AR * 0.7, badgeY = AY + AR * 0.7;
    ctx.fillStyle = '#0B0E14';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${rank > 99 ? '11' : '14'}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${rank}`, badgeX, badgeY);

    // ── Right panel content (x starts at 300) ────────────────────────────────
    const PX = 290;

    // Display name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Truncate if too long
    let dName = displayName || username;
    while (ctx.measureText(dName).width > 380 && dName.length > 1) dName = dName.slice(0, -1);
    if (dName !== (displayName || username)) dName += '…';
    ctx.fillText(dName, PX, 100);

    // Username tag
    ctx.fillStyle = '#6b7280';
    ctx.font = '18px sans-serif';
    ctx.fillText(`@${username}`, PX, 130);

    // ── XP Bar ────────────────────────────────────────────────────────────────
    const barX = PX, barY = 160, barW = 580, barH = 28, barR = 14;
    const progress = Math.min(1, xpNeeded > 0 ? xp / xpNeeded : 0);
    const fillW = Math.max(barR * 2, Math.round(barW * progress));

    // Bar background
    ctx.fillStyle = '#1e2433';
    roundRect(ctx, barX, barY, barW, barH, barR);
    ctx.fill();

    // Bar fill with gradient + glow
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, `${accentColor}aa`);
    barGrad.addColorStop(1, accentColor);
    ctx.fillStyle = barGrad;
    roundRect(ctx, barX, barY, fillW, barH, barR);
    ctx.fill();
    ctx.restore();

    // Bar border
    ctx.strokeStyle = `${accentColor}30`;
    ctx.lineWidth = 1;
    roundRect(ctx, barX, barY, barW, barH, barR);
    ctx.stroke();

    // XP labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${xp.toLocaleString()} XP`, barX, barY + barH + 22);
    ctx.textAlign = 'right';
    ctx.fillText(`${xpNeeded.toLocaleString()} XP needed`, barX + barW, barY + barH + 22);

    // ── Level badge ───────────────────────────────────────────────────────────
    const lvlText = `LEVEL ${level}`;
    ctx.font = 'bold 20px sans-serif';
    const lvlW = ctx.measureText(lvlText).width + 28;
    const lvlX = barX + barW - lvlW, lvlY = barY - 42;

    ctx.fillStyle = `${accentColor}18`;
    ctx.strokeStyle = `${accentColor}60`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, lvlX, lvlY, lvlW, 30, 8);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lvlText, lvlX + lvlW / 2, lvlY + 15);
    ctx.restore();

    // ── Rank label (top-right) ────────────────────────────────────────────────
    ctx.fillStyle = '#6b7280';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`Server Rank  `, barX, lvlY + 20);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`#${rank}`, barX + ctx.measureText('Server Rank  ').width, lvlY + 20);

    // Progress %
    ctx.fillStyle = `${accentColor}80`;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(progress * 100)}%`, barX + barW, lvlY + 20);

    return canvas.toBuffer('image/png');
}

module.exports = { generateRankCard };
