const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeReply, checkDJPerms } = require('../../../shared/utils/discord');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Jump to a timestamp in the current track')
        .addStringOption(opt => opt.setName('time').setDescription('e.g. 1:30 or 90').setRequired(true)),

    async execute(interaction, client, db) {
        const queue = client.helpers.getGuildQueue(client, interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
            return safeReply(interaction, { content: '❌ No music playing.', flags: [MessageFlags.Ephemeral] });
        }
        if (!(await checkDJPerms(interaction, db))) {
            return safeReply(interaction, { content: '❌ DJ role required.', flags: [MessageFlags.Ephemeral] });
        }
        const raw = interaction.options.getString('time').trim();
        let seconds = 0;
        if (/^\d+$/.test(raw)) seconds = parseInt(raw, 10);
        else if (/^\d+:\d{1,2}$/.test(raw)) {
            const [m, s] = raw.split(':').map(Number);
            seconds = m * 60 + s;
        } else {
            return safeReply(interaction, { content: '❌ Use `90` or `1:30`.', flags: [MessageFlags.Ephemeral] });
        }
        await queue.node.seek(seconds * 1000);
        await safeReply(interaction, { content: `⏩ Seeked to **${raw}**.` });
    }
};
