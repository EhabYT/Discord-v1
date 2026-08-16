const { Events, EmbedBuilder } = require('discord.js');
const config = require('../../../config/bot.json');

module.exports = [
    {
        name: Events.GuildMemberUpdate,
        async execute(oldMember, newMember, client) {
            const logCfg = await client.db.get(`logging_${newMember.guild.id}`) || {};

            // Check for role change specifically if we want to use granular role_update
            const isRoleChange = oldMember.roles.cache.size !== newMember.roles.cache.size;
            const logChId = isRoleChange ? (logCfg.role_update || logCfg.audit) : logCfg.audit;

            if (!logChId) return;

            const logCh = await newMember.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder().setTimestamp().setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() });
            let send = false;

            // Nickname Change
            if (oldMember.nickname !== newMember.nickname) {
                embed.setColor(config.colors.info || '#00fbff')
                    .setTitle('🏷️ Nickname Changed')
                    .setDescription(`**Old**: ${oldMember.nickname || 'None'}\n**New**: ${newMember.nickname || 'None'}`);
                send = true;
            }

            // Role Update
            if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
                const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
                const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

                if (added.size > 0 || removed.size > 0) {
                    embed.setColor(config.colors.info || '#00fbff')
                        .setTitle('🛡️ Member Roles Updated');

                    let desc = '';
                    if (added.size > 0) desc += `**Added**: ${added.map(r => r).join(', ')}\n`;
                    if (removed.size > 0) desc += `**Removed**: ${removed.map(r => r).join(', ')}`;

                    embed.setDescription(desc);
                    send = true;
                }
            }

            if (send) await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildUpdate,
        async execute(oldGuild, newGuild, client) {
            const logCfg = await client.db.get(`logging_${newGuild.id}`) || {};
            const logChId = logCfg.server_update || logCfg.audit;
            if (!logChId) return;

            const logCh = await newGuild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;

            let executor = 'Unknown';
            try {
                const fetchedLogs = await newGuild.fetchAuditLogs({
                    limit: 1,
                    type: 5, // GUILD_UPDATE is 5
                });
                const logEntry = fetchedLogs.entries.first();
                if (logEntry && (Date.now() - logEntry.createdTimestamp) < 5000) {
                    executor = logEntry.executor.tag;
                }
            } catch (err) { }

            const embed = new EmbedBuilder()
                .setTimestamp()
                .setColor(config.colors.info || '#00fbff')
                .setTitle('⚙️ Server Updated')
                .setFooter({ text: `Updated by: ${executor}` });

            let changes = [];
            if (oldGuild.name !== newGuild.name) changes.push(`**Name**: ${oldGuild.name} → ${newGuild.name}`);
            if (oldGuild.icon !== newGuild.icon) changes.push(`**Icon**: Icon updated`);
            if (oldGuild.description !== newGuild.description) changes.push(`**Description**: Updated`);
            if (oldGuild.banner !== newGuild.banner) changes.push(`**Banner**: Updated`);

            if (changes.length === 0) return;

            embed.setDescription(changes.join('\n'));
            await logCh.send({ embeds: [embed] });
        }
    }
];
