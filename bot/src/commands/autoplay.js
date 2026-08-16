const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { QueueRepeatMode } = require('discord-player');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Toggle autoplay to get related song suggestions'),

    async execute(interaction, client, db) {
        const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
        if (!queue) {
            return safeReply(interaction, { content: '❌ No music playing.', flags: [MessageFlags.Ephemeral] });
        }

        // DJ Check
        const isDJ = await checkDJPerms(interaction, db);
        if (!isDJ) {
            return safeReply(interaction, { content: '❌ You need the DJ role to use this command when others are in the channel.', flags: [MessageFlags.Ephemeral] });
        }

        const isEnabled = queue.repeatMode === QueueRepeatMode.AUTOPLAY;
        queue.setRepeatMode(isEnabled ? QueueRepeatMode.OFF : QueueRepeatMode.AUTOPLAY);

        // Also save to DB for persistence in events
        await db.set(`autoplay_${interaction.guild.id}`, !isEnabled);

        await safeReply(interaction, {
            content: `✨ Autoplay is now **${!isEnabled ? 'Enabled' : 'Disabled'}**! ${!isEnabled ? 'I will add related songs when the queue ends.' : ''}`
        });
    }
};
