const { Events, EmbedBuilder } = require('discord.js');
const config = require('../../../config/bot.json');

module.exports = [
    // ── Emojis ──
    {
        name: Events.GuildEmojiCreate,
        async execute(emoji, client) {
            const logCfg = await client.db.get(`logging_${emoji.guild.id}`);
            if (!logCfg || !logCfg.emojis) return;

            const logCh = await emoji.guild.channels.fetch(logCfg.emojis).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('😀 Emoji Created')
                .setThumbnail(emoji.url)
                .addFields(
                    { name: 'Name', value: `:${emoji.name}:`, inline: true },
                    { name: 'ID', value: emoji.id, inline: true },
                    { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildEmojiDelete,
        async execute(emoji, client) {
            const logCfg = await client.db.get(`logging_${emoji.guild.id}`);
            if (!logCfg || !logCfg.emojis) return;

            const logCh = await emoji.guild.channels.fetch(logCfg.emojis).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('😀 Emoji Deleted')
                .addFields(
                    { name: 'Name', value: `:${emoji.name}:`, inline: true },
                    { name: 'ID', value: emoji.id, inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildEmojiUpdate,
        async execute(oldEmoji, newEmoji, client) {
            const logCfg = await client.db.get(`logging_${newEmoji.guild.id}`);
            if (!logCfg || !logCfg.emojis) return;

            const logCh = await newEmoji.guild.channels.fetch(logCfg.emojis).catch(() => null);
            if (!logCh) return;

            if (oldEmoji.name === newEmoji.name) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.info || '#00fbff')
                .setTitle('😀 Emoji Updated')
                .setThumbnail(newEmoji.url)
                .setDescription(`**Name**: :${oldEmoji.name}: → :${newEmoji.name}:`)
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    // ── Stickers ──
    {
        name: Events.GuildStickerCreate,
        async execute(sticker, client) {
            const logCfg = await client.db.get(`logging_${sticker.guild.id}`);
            if (!logCfg || !logCfg.emojis) return;

            const logCh = await sticker.guild.channels.fetch(logCfg.emojis).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✨ Sticker Created')
                .setThumbnail(sticker.url)
                .addFields(
                    { name: 'Name', value: sticker.name, inline: true },
                    { name: 'ID', value: sticker.id, inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildStickerDelete,
        async execute(sticker, client) {
            const logCfg = await client.db.get(`logging_${sticker.guild.id}`);
            if (!logCfg || !logCfg.emojis) return;

            const logCh = await sticker.guild.channels.fetch(logCfg.emojis).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('✨ Sticker Deleted')
                .addFields(
                    { name: 'Name', value: sticker.name, inline: true },
                    { name: 'ID', value: sticker.id, inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    }
];
