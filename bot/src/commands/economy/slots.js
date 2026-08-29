const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { withKeyLock } = require('../../../../database/lock');

const REELS = ['🍒', '🍋', '🍇', '⭐', '💎', '7️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Spin the slot machine')
        .addIntegerOption(opt => opt.setName('bet').setDescription('Points to bet').setRequired(true).setMinValue(10).setMaxValue(5000)),

    async execute(interaction, client, db) {
        const bet = interaction.options.getInteger('bet');
        const key = `points_${interaction.guild.id}_${interaction.user.id}`;
        const result = await withKeyLock(key, async (lockedDb) => {
            const balance = Number(await lockedDb.get(key)) || 0;
            if (balance < bet) return { ok: false, balance };

            const spin = [0, 1, 2].map(() => REELS[Math.floor(Math.random() * REELS.length)]);
            let mult = 0;
            if (spin[0] === spin[1] && spin[1] === spin[2]) mult = spin[0] === '7️⃣' ? 8 : spin[0] === '💎' ? 5 : 3;
            else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) mult = 1.5;

            const delta = mult ? Math.floor(bet * mult) : -bet;
            const total = balance + delta;
            await lockedDb.set(key, total);
            return { ok: true, balance, spin, delta, total };
        }, db);

        if (!result.ok) {
            return client.helpers.safeReply(interaction, { content: `❌ You need **${bet}** points (you have ${result.balance}).`, flags: [MessageFlags.Ephemeral] });
        }

        const embed = new EmbedBuilder()
            .setColor(result.delta > 0 ? '#00FF00' : '#FF4D4D')
            .setTitle('🎰 Slots')
            .setDescription(`**${result.spin.join(' | ')}**\n\n${result.delta > 0 ? `You won **${result.delta}** points!` : `You lost **${bet}** points.`}\nBalance: **${result.total}**`)
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};

