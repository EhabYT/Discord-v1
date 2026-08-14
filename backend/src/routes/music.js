const express = require('express');
const router = express.Router({ mergeParams: true });
const { QueueRepeatMode } = require('discord-player');
const { Client: GeniusClient } = require('genius-lyrics');
const { getUserPermLevel } = require('../middleware/permissions');
const { allowAnonymous, sessionUserId } = require('../middleware/auth');
const genius = new GeniusClient();

module.exports = (botClient) => {
    function validateGuild(req, res, next) {
        if (!botClient) return res.status(503).json({ error: 'Bot is initializing' });
        const guild = botClient.guilds.cache.get(req.params.guildId);
        if (!guild) return res.status(404).json({ error: 'Server not found' });
        req.guild = guild;
        next();
    }

    async function requireDJ(req, res, next) {
        const userId = sessionUserId(req);
        if (!userId) {
            // Fails CLOSED — GETs included. Queue contents and lyrics are not
            // public data, and anonymous writes controlled playback outright.
            if (allowAnonymous(req)) return next();
            return res.status(401).json({ error: 'Not authenticated', code: 'AUTH_REQUIRED' });
        }
        if (req.method === 'GET') return next();   // any member may read the queue
        const level = await getUserPermLevel(botClient, req.params.guildId, userId);
        if (level < 1) return res.status(403).json({ error: 'DJ access required' });
        next();
    }

    router.use(validateGuild);
    router.use(requireDJ);

    router.get('/', (req, res) => {
        try {
            if (!botClient.player) return res.json({ playing: false, paused: false, queue: [], volume: 50, filters: [], repeatMode: 0 });
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue || !queue.currentTrack) {
                return res.json({ playing: false, paused: false, queue: [], volume: 50, filters: [], repeatMode: 0, voiceChannel: null });
            }

            const track = queue.currentTrack;
            const progress = queue.node.getTimestamp();
            const paused = !!queue.node.isPaused();
            const vc = queue.channel;

            res.json({
                playing: !paused,
                paused,
                current: {
                    title: track.title,
                    author: track.author,
                    duration: track.duration,
                    url: track.url,
                    thumbnail: track.thumbnail,
                    position: progress ? progress.current.label : '0:00',
                    progress: progress ? Math.round(progress.progress) : 0,
                    source: track.raw?.source || (track.url?.includes('spotify') ? 'spotify' : 'youtube')
                },
                queue: queue.tracks.toArray().slice(0, 25).map((t, i) => ({
                    index: i,
                    title: t.title,
                    author: t.author,
                    duration: t.duration,
                    url: t.url,
                    source: t.raw?.source || (t.url?.includes('spotify') ? 'spotify' : 'youtube')
                })),
                volume: queue.node.volume,
                filters: queue.filters.ffmpeg.getFiltersEnabled(),
                repeatMode: queue.repeatMode ?? 0,
                voiceChannel: vc ? { id: vc.id, name: vc.name } : null,
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/pause', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.node.setPaused(!queue.node.isPaused());
            res.json({ paused: queue.node.isPaused() });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/skip', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.node.skip();
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/stop', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.delete();
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/shuffle', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.tracks.shuffle();
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/clear', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.tracks.clear();
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/volume', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            const volume = parseInt(req.body.volume);
            queue.node.setVolume(Math.max(0, Math.min(100, volume)));
            res.json({ volume: queue.node.volume });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/filters', async (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            await queue.filters.ffmpeg.toggle(req.body.filter);
            res.json({ filters: queue.filters.ffmpeg.getFiltersEnabled() });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/queue/remove', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            const track = queue.tracks.toArray()[req.body.index];
            if (track) queue.node.remove(track);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/search', async (req, res) => {
        try {
            if (!botClient.player) return res.status(500).json({ error: 'Player not ready' });
            const searchResult = await botClient.player.search(req.body.query);
            if (!searchResult?.hasTracks()) return res.json({ tracks: [] });
            res.json({
                tracks: searchResult.tracks.slice(0, 5).map(t => ({
                    title: t.title, author: t.author, url: t.url, thumbnail: t.thumbnail, duration: t.duration, source: t.raw?.source || (t.url?.includes('spotify') ? 'spotify' : 'youtube')
                }))
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/play-remote', async (req, res) => {
        try {
            const wanted = req.body.channelId;
            const voiceChannel = (wanted && req.guild.channels.cache.get(wanted))
                || req.guild.channels.cache.find(c => c.type === 2 && c.members.size > 0);
            if (!voiceChannel || voiceChannel.type !== 2) {
                return res.status(400).json({ error: 'No voice channel found — join one or pick a channel' });
            }
            await botClient.player.play(voiceChannel, req.body.url, { nodeOptions: { metadata: { channel: null } } });
            res.json({ success: true, channelId: voiceChannel.id, channelName: voiceChannel.name });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/channels', (req, res) => {
        try {
            const channels = req.guild.channels.cache
                .filter((c) => c.type === 2)
                .map((c) => ({ id: c.id, name: c.name, members: c.members?.filter((m) => !m.user.bot).size || 0 }));
            res.json(channels);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/loop', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'Queue not found' });
            queue.setRepeatMode(req.body.mode);
            res.json({ success: true, mode: req.body.mode });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.get('/lyrics', async (req, res) => {
        try {
            const searches = await genius.songs.search(req.query.query);
            if (!searches.length) return res.status(404).json({ error: 'No lyrics found' });
            const lyrics = await searches[0].lyrics();
            res.json({ title: searches[0].title, artist: searches[0].artist.name, lyrics, image: searches[0].image });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/autoplay', (req, res) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.repeatMode = req.body.enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF;
            res.json({ success: true, mode: req.body.enabled ? 'autoplay' : 'off' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
};
