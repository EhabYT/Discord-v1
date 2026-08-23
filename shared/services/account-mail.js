const axios = require('axios');

function dashboardOrigin() {
    const raw = String(process.env.DASHBOARD_URL || '').trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        return url.origin;
    } catch { return null; }
}

function escapeHtml(value) {
    return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function sendAccountEmail({ to, subject, title, message, actionLabel, actionPath }) {
    const provider = String(process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase();
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const from = String(process.env.EMAIL_FROM || '').trim();
    const origin = dashboardOrigin();
    if (provider !== 'resend' || !apiKey || !from || !origin) return { sent: false, reason: 'not_configured' };
    const actionUrl = new URL(actionPath, origin).toString();
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const safeLabel = escapeHtml(actionLabel);
    const safeUrl = escapeHtml(actionUrl);
    try {
        await axios.post('https://api.resend.com/emails', {
            from,
            to: [to],
            subject,
            text: `${title}\n\n${message}\n\n${actionUrl}`,
            html: `<div style="font-family:system-ui;background:#05070b;color:#e4e4e7;padding:32px"><div style="max-width:560px;margin:auto;background:#0b0e14;border:1px solid #164e63;border-radius:18px;padding:28px"><h1 style="color:#67e8f9;font-size:22px">${safeTitle}</h1><p style="color:#a1a1aa;line-height:1.6">${safeMessage}</p><a href="${safeUrl}" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:12px;background:#22d3ee;color:#05070b;font-weight:700;text-decoration:none">${safeLabel}</a><p style="color:#52525b;font-size:12px;word-break:break-all;margin-top:20px">${safeUrl}</p></div></div>`,
        }, {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 10_000,
        });
        return { sent: true };
    } catch {
        throw new Error('Email delivery failed');
    }
}

function sendVerificationEmail(account, token) {
    return sendAccountEmail({
        to: account.email,
        subject: 'Verify your EB account email',
        title: 'Verify your email',
        message: 'Confirm this email address for your EB Dashboard account. This single-use link expires in 24 hours.',
        actionLabel: 'Verify email',
        actionPath: `/verify-email?token=${encodeURIComponent(token)}`,
    });
}

function sendEmailChangeVerification(account, newEmail, token) {
    return sendAccountEmail({
        to: newEmail,
        subject: 'Confirm your new EB account email',
        title: 'Confirm new email',
        message: `Confirm this address to replace the current email on @${account.username}. This single-use link expires in 24 hours.`,
        actionLabel: 'Confirm new email',
        actionPath: `/verify-email?token=${encodeURIComponent(token)}`,
    });
}

function sendEmailChangedNotice(oldEmail, account) {
    return sendAccountEmail({
        to: oldEmail,
        subject: 'Your EB account email changed',
        title: 'Email address changed',
        message: `The email address for @${account.username} was changed. If this was not you, contact support immediately and secure your account.`,
        actionLabel: 'Open EB Dashboard',
        actionPath: '/login',
    });
}

function sendPasswordResetEmail(account, token) {
    return sendAccountEmail({
        to: account.email,
        subject: 'Reset your EB account password',
        title: 'Reset your password',
        message: 'A password reset was requested for your EB Dashboard account. This single-use link expires in 30 minutes. Ignore this email if you did not request it.',
        actionLabel: 'Reset password',
        actionPath: `/reset-password?token=${encodeURIComponent(token)}`,
    });
}

module.exports = {
    dashboardOrigin, escapeHtml, sendAccountEmail, sendVerificationEmail,
    sendEmailChangeVerification, sendEmailChangedNotice, sendPasswordResetEmail,
};
