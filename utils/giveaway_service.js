const { EmbedBuilder } = require('discord.js');

const ENTRY_REACTION = '🎉';

function shuffle(values) {
    return [...values].sort(() => Math.random() - 0.5);
}

async function getEligibleUserIds(message, guild, requiredRoleId, excludedIds = []) {
    const reaction = message.reactions.cache.get(ENTRY_REACTION);
    if (!reaction) return [];

    const users = await reaction.users.fetch();
    const excluded = new Set(excludedIds);
    const ids = users
        .filter(user => !user.bot && !excluded.has(user.id))
        .map(user => user.id);

    if (!requiredRoleId) return ids;

    const eligible = [];
    for (const id of ids) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (member?.roles.cache.has(requiredRoleId)) eligible.push(id);
    }
    return eligible;
}

async function finalizeGiveaway(guild, giveaway, logger) {
    const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) {
        giveaway.active = false;
        giveaway.winnerIds = [];
        giveaway.entries = 0;
        giveaway.endedAt = Date.now();
        return { winners: [], entries: 0, messageFound: false };
    }

    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) {
        giveaway.active = false;
        giveaway.winnerIds = [];
        giveaway.entries = 0;
        giveaway.endedAt = Date.now();
        return { winners: [], entries: 0, messageFound: false };
    }

    const allEntries = await getEligibleUserIds(message, guild, giveaway.requiredRoleId);
    const winners = shuffle(allEntries).slice(0, Math.min(giveaway.winners || 1, allEntries.length));
    const embed = message.embeds[0]
        ? EmbedBuilder.from(message.embeds[0])
        : new EmbedBuilder().setDescription(`Prize: **${giveaway.prize}**`);

    embed
        .setColor('#FF0000')
        .setTitle('GIVEAWAY ENDED')
        .setFooter({ text: 'Giveaway ended' })
        .setTimestamp();

    if (winners.length > 0) {
        const mentions = winners.map(id => `<@${id}>`).join(', ');
        embed.addFields({ name: 'Winner(s)', value: mentions });
        await channel.send(`Congratulations ${mentions}! You won **${giveaway.prize}**!`);

        if (giveaway.dmWinner) {
            await Promise.all(winners.map(async id => {
                const member = await guild.members.fetch(id).catch(() => null);
                if (!member) return;
                await member.send(`Congratulations! You won **${giveaway.prize}** in **${guild.name}**.`).catch(() => {});
            }));
        }
    } else {
        embed.addFields({ name: 'Winner(s)', value: 'No valid entries' });
    }

    await message.edit({ embeds: [embed], components: [] });
    giveaway.active = false;
    giveaway.winnerIds = winners;
    giveaway.entries = allEntries.length;
    giveaway.endedAt = Date.now();

    return { winners, entries: allEntries.length, messageFound: true };
}

async function rerollGiveaway(guild, giveaway) {
    const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) throw new Error('Channel not found');

    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) throw new Error('Giveaway message not found');

    const eligible = await getEligibleUserIds(message, guild, giveaway.requiredRoleId, giveaway.winnerIds || []);
    if (eligible.length === 0) throw new Error('No eligible users left to reroll');

    const winner = shuffle(eligible)[0];
    await channel.send(`New winner: <@${winner}>! You won **${giveaway.prize}**!`);

    if (giveaway.dmWinner) {
        const member = await guild.members.fetch(winner).catch(() => null);
        if (member) await member.send(`Congratulations! You won the reroll for **${giveaway.prize}** in **${guild.name}**.`).catch(() => {});
    }

    giveaway.winnerIds = [...(giveaway.winnerIds || []), winner];
    return winner;
}

module.exports = { ENTRY_REACTION, finalizeGiveaway, rerollGiveaway };