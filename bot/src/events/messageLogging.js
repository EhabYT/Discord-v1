const { Events, EmbedBuilder } = require('discord.js');
const config = require('../../../config/bot.json');

module.exports = [
    {
        name: Events.MessageDelete,
        async execute(message, client) {
            if (!message.guild || (message.author && message.author.bot)) return;
            try {
                const { setDelete } = require('../../../shared/services/snipe');
                setDelete(message.channel.id, {
                    content: message.content || '',
                    tag: message.author?.tag,
                    avatar: message.author?.displayAvatarURL?.({ size: 64 }),
                    image: message.attachments?.first()?.url || null
                });
            } catch (e) {}
            const db = client.db;
            const cfg = await db.get(`logging_${message.guild.id}`) || {};

            try {
                const { emitLog } = require('../../../backend/src/websocket/socket');
                emitLog(message.guild.id, {
                    type: 'message_delete',
                    category: 'messages',
                    icon: '🗑️',
                    title: 'Message Deleted',
                    description: message.content ? message.content.slice(0, 200) : '[No content]',
                    author: message.author ? { id: message.author.id, tag: message.author.tag, avatar: message.author.displayAvatarURL?.({ size: 32 }) } : null,
                    channel: { id: message.channel.id, name: message.channel.name },
                    guildId: message.guild.id
                });
            } catch (e) {}

            if (!cfg.messages) return;
            const ch = await message.guild.channels.fetch(cfg.messages).catch(() => null);
            if (!ch) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('🗑️ Message Deleted')
                .addFields(
                    { name: 'Author', value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown', inline: true },
                    { name: 'Channel', value: String(message.channel), inline: true },
                    { name: 'Content', value: message.content ? message.content.slice(0, 1024) : '[No content]' }
                )
                .setTimestamp();
            await ch.send({ embeds: [embed] });
        }
    },
    {
        name: Events.MessageUpdate,
        async execute(oldMsg, newMsg, client) {
            if (!oldMsg.guild || (oldMsg.author && oldMsg.author.bot) || oldMsg.content === newMsg.content) return;
            try {
                const { setEdit } = require('../../../shared/services/snipe');
                setEdit(oldMsg.channel.id, {
                    before: oldMsg.content || '',
                    after: newMsg.content || '',
                    tag: oldMsg.author?.tag,
                    avatar: oldMsg.author?.displayAvatarURL?.({ size: 64 })
                });
            } catch (e) {}
            const db = client.db;
            const cfg = await db.get(`logging_${oldMsg.guild.id}`) || {};

            try {
                const { emitLog } = require('../../../backend/src/websocket/socket');
                emitLog(oldMsg.guild.id, {
                    type: 'message_edit',
                    category: 'messages',
                    icon: '✏️',
                    title: 'Message Edited',
                    before: oldMsg.content ? oldMsg.content.slice(0, 200) : '[No content]',
                    after: newMsg.content ? newMsg.content.slice(0, 200) : '[No content]',
                    author: oldMsg.author ? { id: oldMsg.author.id, tag: oldMsg.author.tag, avatar: oldMsg.author.displayAvatarURL?.({ size: 32 }) } : null,
                    channel: { id: oldMsg.channel.id, name: oldMsg.channel.name },
                    guildId: oldMsg.guild.id
                });
            } catch (e) {}

            if (!cfg.messages) return;
            const ch = await oldMsg.guild.channels.fetch(cfg.messages).catch(() => null);
            if (!ch) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.warning)
                .setTitle('✏️ Message Edited')
                .addFields(
                    { name: 'Author', value: oldMsg.author?.tag || 'Unknown', inline: true },
                    { name: 'Channel', value: String(oldMsg.channel), inline: true },
                    { name: 'Before', value: oldMsg.content ? oldMsg.content.slice(0, 1024) : '[No content]' },
                    { name: 'After', value: newMsg.content ? newMsg.content.slice(0, 1024) : '[No content]' }
                )
                .setTimestamp();
            await ch.send({ embeds: [embed] });
        }
    }
];
