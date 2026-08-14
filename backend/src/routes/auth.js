const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

function publicOrigin(req) {
    const xfHost = req.headers['x-forwarded-host'];
    const host = (typeof xfHost === 'string' ? xfHost.split(',')[0].trim() : null) || req.headers.host;
    if (!host) return null;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(host)) return null;
    const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (req.secure ? 'https' : 'http');
    return `${proto}://${host}`;
}

function redirectUriFor(req) {
    const origin = publicOrigin(req);
    if (origin) return `${origin}/api/auth/discord/callback`;
    return process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback';
}

function attachAuthenticatedSession(session, user, userGuilds) {
    session.user = user;
    session.userGuilds = userGuilds;
    delete session.oauthRedirect;
}

function oauthErrorPage(res, title, detail, redirectUri) {
    const safeTitle = String(title || 'Login failed').slice(0, 120);
    const safeDetail = String(detail || '').slice(0, 500);
    const safeUri = String(redirectUri || '').slice(0, 300);
    res.status(400).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>EB Dashboard — ${safeTitle}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#070A0F;color:#e5e7eb;font-family:Inter,system-ui,sans-serif}
.card{max-width:520px;margin:24px;padding:28px;border-radius:16px;background:#0B0E14;border:1px solid rgba(0,255,255,.15)}
h1{margin:0 0 8px;color:#67e8f9;font-size:20px}
p{color:#9ca3af;line-height:1.5}
code{display:block;margin:12px 0;padding:10px 12px;border-radius:8px;background:#111827;color:#67e8f9;word-break:break-all;font-size:12px}
a{display:inline-block;margin-top:12px;padding:8px 14px;border-radius:8px;background:rgba(0,255,255,.12);border:1px solid rgba(0,255,255,.35);color:#67e8f9;text-decoration:none}
</style></head><body><div class="card">
<h1>${safeTitle}</h1>
<p>${safeDetail}</p>
${safeUri ? `<p>Add this exact Redirect URI in the Discord Developer Portal → OAuth2 → Redirects:</p><code>${safeUri}</code>` : ''}
<a href="/">Back to dashboard</a>
</div></body></html>`);
}

module.exports = (botClient) => {
    router.get('/discord', (req, res) => {
        if (!process.env.CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
            return oauthErrorPage(res, 'OAuth not configured', 'CLIENT_ID or DISCORD_CLIENT_SECRET is missing.');
        }
        const redirectUri = redirectUriFor(req);
        req.session.oauthRedirect = redirectUri;
        // OAuth CSRF ("login CSRF"): without a state parameter an attacker can
        // feed a victim their own authorization code and silently sign the
        // victim's browser into the attacker's Discord account.
        const state = crypto.randomBytes(32).toString('hex');
        req.session.oauthState = state;
        req.session.save((err) => {
            if (err) return res.redirect('/?oauth=session');
            const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds&state=${state}`;
            res.redirect(url);
        });
    });

    async function oauthCallback(req, res) {
        if (req.query.error) {
            return oauthErrorPage(
                res,
                'Discord login cancelled',
                req.query.error_description || req.query.error,
                req.session.oauthRedirect || redirectUriFor(req)
            );
        }
        const { code } = req.query;
        if (!code) return res.redirect('/');

        // Constant-time comparison of the state we issued against the one returned.
        const expectedState = req.session.oauthState;
        const gotState = typeof req.query.state === 'string' ? req.query.state : '';
        delete req.session.oauthState;          // single use, whatever the outcome
        const a = Buffer.from(String(expectedState || ''));
        const b = Buffer.from(gotState);
        const stateOk = !!expectedState && a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!stateOk) {
            return oauthErrorPage(res, 'Login verification failed',
                'The login request could not be verified (state mismatch). Start the login again from the dashboard.',
                '');
        }

        const redirectUri = req.session.oauthRedirect || redirectUriFor(req);
        try {
            const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const accessToken = tokenResponse.data.access_token;

            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const user = {
                id: userResponse.data.id,
                username: userResponse.data.username,
                tag: `${userResponse.data.username}#${userResponse.data.discriminator || '0000'}`,
                avatar: userResponse.data.avatar
                    ? `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(userResponse.data.id, 10) % 5}.png`
            };
            // Session fixation: an attacker who plants a known session id in the
            // victim's browser before login would otherwise still hold a valid
            // authenticated session afterwards. Issue a fresh id at the moment
            // privileges change.
            await new Promise((resolve) => req.session.regenerate(() => resolve()));
            attachAuthenticatedSession(req.session, user, guildsResponse.data);
            // The Discord access token is not needed after this point — the
            // dashboard authorises from session identity + the bot's own gateway
            // state — so it is deliberately not persisted into the session store.
            await new Promise((resolve) => req.session.save(() => resolve()));

            res.redirect('/');
        } catch (err) {
            const data = err.response?.data;
            const desc = data?.error_description || data?.error || err.message;
            console.error('OAuth2 Error:', data || err.message);
            oauthErrorPage(
                res,
                'Discord login failed',
                desc === 'invalid_grant' || String(desc).includes('redirect')
                    ? 'Redirect URI mismatch. Add the URI below in the Discord Developer Portal, then try again.'
                    : String(desc),
                redirectUri
            );
        }
    }

    router.get('/callback', oauthCallback);
    router.get('/discord/callback', oauthCallback);

    router.get('/status', (req, res) => {
        const redirectUri = redirectUriFor(req);
        res.json({
            loggedIn: !!req.session.user,
            oauthEnabled: !!(process.env.CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
            // Auth is now enforced unless explicitly disabled (fails closed).
            authRequired: String(process.env.DASHBOARD_AUTH).toLowerCase() !== 'false',
            redirectUri,
        });
    });

    // Duplicate of GET /api/me in server.js, which was gated during the first
    // remediation. This copy was missed and kept serving the BOT OWNER's real
    // username, tag and avatar to unauthenticated callers — verified live:
    //   {"username":"RealOwner","tag":"RealOwner#0001","avatar":"https://…"}
    //
    // The dashboard client only calls /api/me, so gating this changes no UI
    // behaviour. Kept rather than deleted because it is a published endpoint
    // that external tooling may rely on; it now returns the same shape only to
    // an authenticated caller.
    router.get('/me', requireAuth, (req, res) => {
        try {
            if (req.session.user) {
                return res.json({ ...req.session.user, loggedIn: true });
            }

            if (!botClient || !botClient.user) {
                return res.json({ username: 'Not Connected', avatar: null, loggedIn: false });
            }

            const app = botClient.application;
            const owner = app?.owner?.user || botClient.user;
            res.json({
                username: owner.username,
                tag: owner.tag || owner.username || 'Bot Admin',
                avatar: owner.displayAvatarURL ? owner.displayAvatarURL({ size: 128 }) : null,
                loggedIn: false
            });
        } catch (err) {
            res.json({ username: 'Error', avatar: null, loggedIn: false });
        }
    });

    router.post('/logout', (req, res) => {
        req.session.destroy(() => res.json({ success: true }));
    });

    return router;
};
