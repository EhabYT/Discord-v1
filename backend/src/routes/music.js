const express = require('express');
const router = express.Router({ mergeParams: true });
const { QueueRepeatMode } = require('discord-player');
const { Client: GeniusClient } = require('genius-lyrics');
const { getUserPermLevel } = require('../middleware/permissions');
const { sessionUserId } = require('../middleware/auth');
const guildAccess = require('../middleware/guild-access');
const genius = new GeniusClient();

module.exports = (botClient) => {
    async function requireDJ(req, res, next) {
        const userId = sessionUserId(req);
        // The explicit localhost-only development bypass has no Discord user.
        if (!userId || req.method === 'GET') return next();
        const level = await getUserPermLevel(botClient, req.params.guildId, userId);
        if (level < 1) return res.status(403).json({ error: 'DJ access required' });
        return next();
    }

    // Apply authentication, guild validation, membership isolation and Viewer
    // access before exposing queue/lyrics data. Previously any authenticated
    // user could read another server's music endpoints by guessing its id.
    router.use(guildAccess.guildAccessStack(botClient, 0));
    router.use(requireDJ);

    router.get('/', (req, res, next) => {
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
        } catch (err) { next(err); }
    });

    router.post('/pause', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.node.setPaused(!queue.node.isPaused());
            res.json({ paused: queue.node.isPaused() });
        } catch (err) { next(err); }
    });

    router.post('/skip', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.node.skip();
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/stop', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.delete();
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/shuffle', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.tracks.shuffle();
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/clear', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            queue.tracks.clear();
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/volume', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            const volume = Number(req.body.volume);
            if (!Number.isFinite(volume)) return res.status(400).json({ error: 'Volume must be a number' });
            const safeVolume = Math.round(Math.max(0, Math.min(100, volume)));
            queue.node.setVolume(safeVolume);
            res.json({ volume: queue.node.volume });
        } catch (err) { next(err); }
    });

    router.post('/filters', async (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            const filter = typeof req.body.filter === 'string' ? req.body.filter.trim() : '';
            if (!filter || filter.length > 64 || !/^[a-z0-9_-]+$/i.test(filter)) {
                return res.status(400).json({ error: 'Invalid audio filter' });
            }
            await queue.filters.ffmpeg.toggle(filter);
            res.json({ filters: queue.filters.ffmpeg.getFiltersEnabled() });
        } catch (err) { next(err); }
    });

    router.post('/queue/remove', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            const index = Number(req.body.index);
            if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'Invalid queue index' });
            const track = queue.tracks.toArray()[index];
            if (!track) return res.status(404).json({ error: 'Queue item not found' });
            queue.node.remove(track);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.post('/search', async (req, res, next) => {
        try {
            if (!botClient.player) return res.status(503).json({ error: 'Player not ready' });
            const query = typeof req.body.query === 'string' ? req.body.query.trim() : '';
            if (!query || query.length > 500) return res.status(400).json({ error: 'Enter a valid search query' });
            const searchResult = await botClient.player.search(query);
            if (!searchResult?.hasTracks()) return res.json({ tracks: [] });
            res.json({
                tracks: searchResult.tracks.slice(0, 5).map(t => ({
                    title: t.title, author: t.author, url: t.url, thumbnail: t.thumbnail, duration: t.duration, source: t.raw?.source || (t.url?.includes('spotify') ? 'spotify' : 'youtube')
                }))
            });
        } catch (err) { next(err); }
    });

    router.post('/play-remote', async (req, res, next) => {
        try {
            const source = typeof req.body.url === 'string' ? req.body.url.trim() : '';
            if (!source || source.length > 2000) return res.status(400).json({ error: 'Enter a valid track URL or search query' });
            const wanted = typeof req.body.channelId === 'string' ? req.body.channelId : '';
            if (wanted && !/^\d{17,20}$/.test(wanted)) return res.status(400).json({ error: 'Invalid voice channel id' });
            const voiceChannel = (wanted && req.guild.channels.cache.get(wanted))
                || req.guild.channels.cache.find(c => c.type === 2 && c.members.size > 0);
            if (!voiceChannel || voiceChannel.type !== 2) {
                return res.status(400).json({ error: 'No voice channel found — join one or pick a channel' });
            }
            await botClient.player.play(voiceChannel, source, { nodeOptions: { metadata: { channel: null } } });
            res.json({ success: true, channelId: voiceChannel.id, channelName: voiceChannel.name });
        } catch (err) { next(err); }
    });

    router.get('/channels', (req, res, next) => {
        try {
            const channels = req.guild.channels.cache
                .filter((c) => c.type === 2)
                .map((c) => ({ id: c.id, name: c.name, members: c.members?.filter((m) => !m.user.bot).size || 0 }));
            res.json(channels);
        } catch (err) { next(err); }
    });

    router.post('/loop', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'Queue not found' });
            const mode = Number(req.body.mode);
            if (!Number.isInteger(mode) || mode < QueueRepeatMode.OFF || mode > QueueRepeatMode.AUTOPLAY) {
                return res.status(400).json({ error: 'Invalid repeat mode' });
            }
            queue.setRepeatMode(mode);
            res.json({ success: true, mode });
        } catch (err) { next(err); }
    });

    router.get('/lyrics', async (req, res, next) => {
        try {
            const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
            if (!query || query.length > 300) return res.status(400).json({ error: 'Enter a valid lyrics query' });
            const searches = await genius.songs.search(query);
            if (!searches.length) return res.status(404).json({ error: 'No lyrics found' });
            const lyrics = await searches[0].lyrics();
            res.json({ title: searches[0].title, artist: searches[0].artist.name, lyrics, image: searches[0].image });
        } catch (err) { next(err); }
    });

    router.post('/autoplay', (req, res, next) => {
        try {
            const queue = botClient.player.nodes.get(req.params.guildId);
            if (!queue) return res.status(404).json({ error: 'No queue' });
            if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
            queue.repeatMode = req.body.enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF;
            res.json({ success: true, mode: req.body.enabled ? 'autoplay' : 'off' });
        } catch (err) { next(err); }
    });

    return router;
};
