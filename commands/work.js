const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

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
        const last = Number(await db.get(cdKey)) || 0;
        const wait = 30 * 60 * 1000;
        if (Date.now() - last < wait) {
            const left = Math.ceil((wait - (Date.now() - last)) / 60000);
            return client.helpers.safeReply(interaction, { content: `⏳ You can work again in **${left}m**.`, flags: [MessageFlags.Ephemeral] });
        }
        const [job, min, max] = JOBS[Math.floor(Math.random() * JOBS.length)];
        const pay = Math.floor(Math.random() * (max - min + 1)) + min;
        const key = `points_${interaction.guild.id}_${interaction.user.id}`;
        const total = (Number(await db.get(key)) || 0) + pay;
        await db.set(key, total);
        await db.set(cdKey, Date.now());
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('💼 Shift complete')
            .setDescription(`You ${job} and earned **${pay}** points.\nBalance: **${total}**`)
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
