const express = require('express');
const router = express.Router();
const axios = require('axios');

module.exports = (botClient) => {
    router.get('/discord', (req, res) => {
        const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
        res.redirect(url);
    });

    router.get('/callback', async (req, res) => {
        const { code } = req.query;
        if (!code) return res.redirect('/');

        try {
            const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const accessToken = tokenResponse.data.access_token;
            req.session.accessToken = accessToken;

            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            req.session.user = {
                id: userResponse.data.id,
                username: userResponse.data.username,
                tag: `${userResponse.data.username}#${userResponse.data.discriminator || '0000'}`,
                avatar: userResponse.data.avatar
                    ? `https://cdn.discordapp.com/avatars/${userResponse.data.id}/${userResponse.data.avatar}.png`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(userResponse.data.id) % 5}.png`
            };
            req.session.userGuilds = guildsResponse.data;

            res.redirect('/');
        } catch (err) {
            console.error('OAuth2 Error:', err.response?.data || err.message);
            res.redirect('/');
        }
    });

    router.get('/me', async (req, res) => {
        try {
            if (req.session.user) {
                return res.json(req.session.user);
            }

            if (!botClient || !botClient.user) {
                return res.json({ username: 'Not Connected', avatar: null });
            }

            const app = botClient.application;
            const owner = app?.owner?.user || botClient.user;
            res.json({
                username: owner.username,
                tag: owner.tag || owner.username || 'Bot Admin',
                avatar: owner.displayAvatarURL ? owner.displayAvatarURL({ size: 128 }) : null
            });
        } catch (err) {
            res.json({ username: 'Error', avatar: null });
        }
    });

    router.post('/logout', (req, res) => {
        req.session.destroy();
        res.json({ success: true });
    });

    return router;
};
