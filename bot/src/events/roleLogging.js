const { Events, EmbedBuilder } = require('discord.js');
const config = require('../../../config/bot.json');

module.exports = [
    {
        name: Events.GuildRoleCreate,
        async execute(role, client) {
            const logCfg = await client.db.get(`logging_${role.guild.id}`);
            if (!logCfg || !logCfg.roles) return;

            const logCh = await role.guild.channels.fetch(logCfg.roles).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('🎭 Role Created')
                .addFields(
                    { name: 'Role', value: `${role} (${role.name})`, inline: true },
                    { name: 'ID', value: role.id, inline: true },
                    { name: 'Color', value: role.hexColor, inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildRoleDelete,
        async execute(role, client) {
            const logCfg = await client.db.get(`logging_${role.guild.id}`) || {};
            const logChId = logCfg.role_delete || logCfg.roles;
            if (!logChId) return;

            const logCh = await role.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle('🎭 Role Deleted')
                .addFields(
                    { name: 'Name', value: role.name, inline: true },
                    { name: 'ID', value: role.id, inline: true }
                )
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    },
    {
        name: Events.GuildRoleUpdate,
        async execute(oldRole, newRole, client) {
            const logCfg = await client.db.get(`logging_${newRole.guild.id}`) || {};
            const logChId = logCfg.role_update || logCfg.roles;
            if (!logChId) return;

            const logCh = await newRole.guild.channels.fetch(logChId).catch(() => null);
            if (!logCh) return;

            const changes = [];
            if (oldRole.name !== newRole.name) changes.push(`**Name**: ${oldRole.name} → ${newRole.name}`);
            if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Color**: ${oldRole.hexColor} → ${newRole.hexColor}`);
            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push(`**Permissions updated**`);

            if (changes.length === 0) return;

            const embed = new EmbedBuilder()
                .setColor(config.colors.info || '#00fbff')
                .setTitle('🎭 Role Updated')
                .setDescription(`Role: ${newRole}\n\n${changes.join('\n')}`)
                .setTimestamp();

            await logCh.send({ embeds: [embed] });
        }
    }
];
