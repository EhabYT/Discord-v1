const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { withKeyLocks } = require('../../../../database/lock');

const JOBS = [
    ['delivered pizza', 40, 90],
    ['fixed a bug', 50, 120],
    ['walked dogs', 25, 70],
    ['streamed a raid', 60, 140],
    ['wrote documentation', 30, 80],
    ['moderated a community', 45, 100],
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work a shift and earn points'),

    async execute(interaction, client, db) {
        const cdKey = `work_cd_${interaction.guild.id}_${interaction.user.id}`;
        const wait = 30 * 60 * 1000;
        const key = `points_${interaction.guild.id}_${interaction.user.id}`;
        const result = await withKeyLocks([cdKey, key], async (lockedDb) => {
            const now = Date.now();
            const last = Number(await lockedDb.get(cdKey)) || 0;
            if (now - last < wait) {
                return { ok: false, left: Math.ceil((wait - (now - last)) / 60000) };
            }
            const [job, min, max] = JOBS[Math.floor(Math.random() * JOBS.length)];
            const pay = Math.floor(Math.random() * (max - min + 1)) + min;
            const total = (Number(await lockedDb.get(key)) || 0) + pay;
            await lockedDb.set(key, total);
            await lockedDb.set(cdKey, now);
            return { ok: true, job, pay, total };
        }, db);

        if (!result.ok) {
            return client.helpers.safeReply(interaction, { content: `⏳ You can work again in **${result.left}m**.`, flags: [MessageFlags.Ephemeral] });
        }
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('💼 Shift complete')
            .setDescription(`You ${result.job} and earned **${result.pay}** points.\nBalance: **${result.total}**`)
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};

