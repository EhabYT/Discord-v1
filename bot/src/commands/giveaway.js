const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType,
    MessageFlags
} = require('discord.js');
const { finalizeGiveaway, rerollGiveaway, ENTRY_REACTION } = require('../../../shared/services/giveaways');

const MAX_DURATION = 30 * 24 * 60 * 60 * 1000;

function getColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#FF69B4';
}

function formatWinners(ids = []) {
    return ids.length ? ids.map(id => `<@${id}>`).join(', ') : 'No winners yet';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manage giveaways')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('start')
                .setDescription('Start a giveaway')
                .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
                .addStringOption(opt => opt.setName('duration').setDescription('Duration (1m, 1h, 1d, 1w)').setRequired(true))
                .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
                .addStringOption(opt => opt.setName('description').setDescription('Additional giveaway details').setMaxLength(1000))
                .addChannelOption(opt => opt
                    .setName('channel')
                    .setDescription('Channel where the giveaway should be posted')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
                .addRoleOption(opt => opt.setName('required_role').setDescription('Role required to enter'))
                .addStringOption(opt => opt.setName('color').setDescription('Embed color in hex format, for example #FF69B4').setMaxLength(7))
                .addBooleanOption(opt => opt.setName('dm_winners').setDescription('Send winners a direct message'))
        )
        .addSubcommand(sub =>
            sub.setName('end')
                .setDescription('End a giveaway immediately')
                .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('reroll')
                .setDescription('Choose another winner')
                .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Show giveaway details')
                .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete a giveaway and its message')
                .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List active giveaways')
        ),
    defer: true,

    async execute(interaction, client, db) {
        const subcommand = interaction.options.getSubcommand();
        const { safeReply, parseTimeString } = client.helpers;
        const guild = interaction.guild;
        const giveawaysKey = `giveaways_${guild.id}`;

        if (subcommand === 'start') {
            const prize = interaction.options.getString('prize').trim();
            const durationStr = interaction.options.getString('duration');
            const duration = parseTimeString(durationStr);
            const winners = interaction.options.getInteger('winners') || 1;
            const description = interaction.options.getString('description') || '';
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const requiredRole = interaction.options.getRole('required_role');
            const color = getColor(interaction.options.getString('color') || '#FF69B4');
            const dmWinner = interaction.options.getBoolean('dm_winners') ?? true;

            if (!duration || duration < 60 * 1000 || duration > MAX_DURATION) {
                return safeReply(interaction, {
                    content: '❌ Duration must be between 1 minute and 30 days.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            if (!channel?.isTextBased?.() || !channel.send) {
                return safeReply(interaction, {
                    content: '❌ The selected channel cannot receive messages.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const endsAt = Date.now() + duration;
            const details = [
                description,
                `**Prize:** ${prize}`,
                `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`,
                `**Winners:** ${winners}`,
                requiredRole ? `**Required role:** ${requiredRole}` : '',
                `React with ${ENTRY_REACTION} to enter!`
            ].filter(Boolean).join('\n');

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('🎉 GIVEAWAY 🎉')
                .setDescription(details)
                .setFooter({ text: `${winners} winner(s) • React with ${ENTRY_REACTION} to enter` })
                .setTimestamp(endsAt);

            const message = await channel.send({ embeds: [embed] });
            await message.react(ENTRY_REACTION);

            const giveaway = {
                messageId: message.id,
                channelId: channel.id,
                guildId: guild.id,
                prize,
                description,
                winners,
                endsAt,
                hostId: interaction.user.id,
                active: true,
                requiredRoleId: requiredRole?.id || null,
                color,
                dmWinner,
                entries: 0,
                winnerIds: [],
                createdAt: Date.now()
            };
            const giveaways = await db.get(giveawaysKey) || [];
            giveaways.push(giveaway);
            await db.set(giveawaysKey, giveaways);

            return safeReply(interaction, {
                content: `✅ Giveaway started in ${channel}. It ends <t:${Math.floor(endsAt / 1000)}:R>.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const messageId = interaction.options.getString('message_id');
        const giveaways = await db.get(giveawaysKey) || [];
        const giveaway = messageId ? giveaways.find(item => item.messageId === messageId) : null;

        if (subcommand === 'end') {
            if (!giveaway?.active) {
                return safeReply(interaction, { content: '❌ Active giveaway not found.', flags: [MessageFlags.Ephemeral] });
            }

            await finalizeGiveaway(guild, giveaway);
            await db.set(giveawaysKey, giveaways);
            return safeReply(interaction, {
                content: `✅ Giveaway ended. Winners: ${formatWinners(giveaway.winnerIds)}.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        if (subcommand === 'reroll') {
            if (!giveaway || giveaway.active) {
                return safeReply(interaction, { content: '❌ Ended giveaway not found.', flags: [MessageFlags.Ephemeral] });
            }

            try {
                const winner = await rerollGiveaway(guild, giveaway);
                await db.set(giveawaysKey, giveaways);
                return safeReply(interaction, {
                    content: `✅ New winner: <@${winner}>.`,
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (err) {
                return safeReply(interaction, { content: `❌ ${err.message}.`, flags: [MessageFlags.Ephemeral] });
            }
        }

        if (subcommand === 'info') {
            if (!giveaway) {
                return safeReply(interaction, { content: '❌ Giveaway not found.', flags: [MessageFlags.Ephemeral] });
            }

            const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
            const message = channel ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;
            const reaction = message?.reactions.cache.get(ENTRY_REACTION);
            const entries = reaction ? Math.max(0, reaction.count - 1) : giveaway.entries || 0;
            const info = new EmbedBuilder()
                .setColor(getColor(giveaway.color))
                .setTitle(`Giveaway: ${giveaway.prize}`)
                .addFields(
                    { name: 'Status', value: giveaway.active ? `Active · ends <t:${Math.floor(giveaway.endsAt / 1000)}:R>` : 'Ended', inline: true },
                    { name: 'Channel', value: channel ? `${channel}` : 'Unavailable', inline: true },
                    { name: 'Entries', value: String(entries), inline: true },
                    { name: 'Winners', value: formatWinners(giveaway.winnerIds), inline: false }
                );
            if (giveaway.requiredRoleId) info.addFields({ name: 'Required role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });
            return safeReply(interaction, { embeds: [info], flags: [MessageFlags.Ephemeral] });
        }

        if (subcommand === 'delete') {
            if (!giveaway) {
                return safeReply(interaction, { content: '❌ Giveaway not found.', flags: [MessageFlags.Ephemeral] });
            }

            const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
            const message = channel ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;
            if (message) await message.delete().catch(() => {});
            await db.set(giveawaysKey, giveaways.filter(item => item.messageId !== messageId));
            return safeReply(interaction, { content: '✅ Giveaway deleted.', flags: [MessageFlags.Ephemeral] });
        }

        if (subcommand === 'list') {
            const active = giveaways.filter(item => item.active);
            if (active.length === 0) {
                return safeReply(interaction, { content: '❌ No active giveaways.', flags: [MessageFlags.Ephemeral] });
            }

            const description = active.map((item, index) =>
                `**${index + 1}.** ${item.prize}\nMessage: \`${item.messageId}\` · <#${item.channelId}>\nEnds: <t:${Math.floor(item.endsAt / 1000)}:R> · Winners: ${item.winners}`
            ).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('🎉 Active Giveaways')
                .setDescription(description)
                .setTimestamp();
            return safeReply(interaction, { embeds: [embed] });
        }
    }
};