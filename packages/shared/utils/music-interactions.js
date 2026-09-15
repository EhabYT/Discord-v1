const { MessageFlags } = require('discord.js');
const { checkDJPerms } = require('./discord');
const logger = require('../lib/logger');

async function handleMusicButton(i, player, db) {
    if (!i.guild || !player?.nodes) return i.reply({ content: '❌ Nothing playing.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    const queue = player.nodes.get(i.guild.id);
    if (!queue || !queue.isPlaying()) return i.reply({ content: ' Nothing playing.', flags: [MessageFlags.Ephemeral] });
    if (!(await checkDJPerms(i, db))) return i.reply({ content: ' DJ role required.', flags: [MessageFlags.Ephemeral] });

    try {
        switch (i.customId) {
            case 'music_pause_resume':
                queue.node.setPaused(!queue.node.isPaused());
                await i.reply({ content: queue.node.isPaused() ? 'Paused' : 'Resumed', flags: [MessageFlags.Ephemeral] });
                break;
            case 'music_skip':
                queue.node.skip();
                await i.reply({ content: 'Skipped!', flags: [MessageFlags.Ephemeral] });
                break;
            case 'music_stop':
                queue.delete();
                await i.reply({ content: 'Stopped!', flags: [MessageFlags.Ephemeral] });
                break;
            case 'music_shuffle':
                queue.tracks.shuffle();
                await i.reply({ content: 'Shuffled!', flags: [MessageFlags.Ephemeral] });
                break;
            case 'music_loop': {
                const next = (queue.repeatMode + 1) % 3;
                queue.setRepeatMode(next);
                await i.reply({ content: `Loop: ${next}`, flags: [MessageFlags.Ephemeral] });
                break;
            }
            case 'music_voldown':
                queue.node.setVolume(Math.max(0, queue.node.volume - 10));
                await i.reply({ content: `Volume: ${queue.node.volume}`, flags: [MessageFlags.Ephemeral] });
                break;
            case 'music_volup':
                queue.node.setVolume(Math.min(200, queue.node.volume + 10));
                await i.reply({ content: `Volume: ${queue.node.volume}`, flags: [MessageFlags.Ephemeral] });
                break;
        }
    } catch (err) {
        logger.error('Music btn error', { error: err.message });
        await i.reply({ content: `Error: ${err.message}`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
    }
}

async function handleMusicFilterSelect(i, player, db) {
    if (!i.guild || !player?.nodes) return i.reply({ content: '❌ Nothing playing.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    const queue = player.nodes.get(i.guild.id);
    if (!queue || !queue.isPlaying()) return i.reply({ content: ' Nothing playing.', flags: [MessageFlags.Ephemeral] });
    if (!(await checkDJPerms(i, db))) return i.reply({ content: ' DJ role required.', flags: [MessageFlags.Ephemeral] });

    const selection = i.values[0];
    await i.deferReply({ flags: [MessageFlags.Ephemeral] });
    try {
        if (selection === 'clear') {
            queue.filters.ffmpeg.setFilters(false);
            return i.editReply({ content: 'Filters cleared!' });
        }
        queue.filters.ffmpeg.toggle([selection]);
        await i.editReply({ content: `Filter ${selection} toggled!` });
    } catch (err) {
        logger.error('Filter error', { error: err.message });
        await i.editReply({ content: `Failed: ${err.message}` });
    }
}

module.exports = { handleMusicButton, handleMusicFilterSelect };
