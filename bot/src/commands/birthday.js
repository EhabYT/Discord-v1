const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
];

function daysInMonth(month) {
    return [31,29,31,30,31,30,31,31,30,31,30,31][month - 1];
}

function ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function daysUntil(month, day) {
    const now   = new Date();
    const next  = new Date(now.getFullYear(), month - 1, day);
    if (next < now) next.setFullYear(now.getFullYear() + 1);
    return Math.ceil((next - now) / 86400000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Birthday system — set, view, and celebrate birthdays')

        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Set your birthday')
            .addIntegerOption(opt =>
                opt.setName('month').setDescription('Month (1–12)').setRequired(true).setMinValue(1).setMaxValue(12)
            )
            .addIntegerOption(opt =>
                opt.setName('day').setDescription('Day').setRequired(true).setMinValue(1).setMaxValue(31)
            )
        )

        .addSubcommand(sub => sub
            .setName('view')
            .setDescription("View someone's birthday")
            .addUserOption(opt => opt.setName('user').setDescription('Member (defaults to you)'))
        )

        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove your birthday from this server')
        )

        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List upcoming birthdays in this server')
        ),

    async execute(interaction, client, db) {
        const sub     = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        // ── SET ───────────────────────────────────────────────────────────────
        if (sub === 'set') {
            const month = interaction.options.getInteger('month');
            const day   = interaction.options.getInteger('day');

            if (day > daysInMonth(month)) {
                return interaction.reply({ content: `❌ ${MONTHS[month - 1]} only has ${daysInMonth(month)} days.`, flags: [MessageFlags.Ephemeral] });
            }

            await db.set(`birthday_${guildId}_${interaction.user.id}`, { month, day, setAt: Date.now() });

            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('🎂 Birthday Set!')
                .setDescription(`Your birthday has been saved as **${MONTHS[month - 1]} ${ordinal(day)}**.\nI'll celebrate with you on that day! 🎉`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        // ── VIEW ──────────────────────────────────────────────────────────────
        if (sub === 'view') {
            const target = interaction.options.getUser('user') || interaction.user;
            const bday   = await db.get(`birthday_${guildId}_${target.id}`);

            if (!bday) {
                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor('#374151')
                        .setDescription(`${target} hasn't set their birthday yet.`)
                    ], flags: [MessageFlags.Ephemeral]
                });
            }

            const days  = daysUntil(bday.month, bday.day);
            const today = new Date();
            const isBday = today.getMonth() + 1 === bday.month && today.getDate() === bday.day;

            const embed = new EmbedBuilder()
                .setColor(isBday ? '#FF69B4' : '#00FFFF')
                .setTitle(isBday ? `🎉 It's ${target.username}'s Birthday TODAY!` : `🎂 ${target.username}'s Birthday`)
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: 'Date',      value: `**${MONTHS[bday.month - 1]} ${ordinal(bday.day)}**`, inline: true },
                    { name: isBday ? '🎊' : 'Coming up', value: isBday ? 'TODAY! 🎂' : `In **${days}** day${days !== 1 ? 's' : ''}`, inline: true },
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // ── REMOVE ────────────────────────────────────────────────────────────
        if (sub === 'remove') {
            try {
                await db.delete(`birthday_${guildId}_${interaction.user.id}`);
            } catch {
                await db.set(`birthday_${guildId}_${interaction.user.id}`, null);
            }
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#6b7280').setDescription('🗑️ Your birthday has been removed from this server.')],
flags: [MessageFlags.Ephemeral]
            });
        }

        // ── LIST ──────────────────────────────────────────────────────────────
        if (sub === 'list') {
            await interaction.deferReply();

            const all   = await db.all();
            const prefix = `birthday_${guildId}_`;
            const entries = all
                .filter(e => e.id.startsWith(prefix) && e.value && e.value.month)
                .map(e => ({ userId: e.id.replace(prefix, ''), ...e.value }))
                .sort((a, b) => {
                    const da = daysUntil(a.month, a.day);
                    const db_ = daysUntil(b.month, b.day);
                    return da - db_;
                })
                .slice(0, 20);

            if (entries.length === 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#374151')
                        .setDescription('No birthdays have been set yet. Use `/birthday set` to add yours!')
                    ]
                });
            }

            // Fetch usernames without mutating entries across an await boundary.
            const enrichedEntries = await Promise.all(entries.map(async (entry) => {
                const user = await client.users.fetch(entry.userId).catch(() => null);
                return {
                    ...entry,
                    username: user?.username || entry.userId,
                    avatar: user?.displayAvatarURL({ size: 32 }),
                };
            }));

            const today   = new Date();
            const todayM  = today.getMonth() + 1;
            const todayD  = today.getDate();

            const lines = enrichedEntries.map(e => {
                const days   = daysUntil(e.month, e.day);
                const isBday = todayM === e.month && todayD === e.day;
                const dateStr = `${MONTHS[e.month - 1]} ${ordinal(e.day)}`;
                const tag    = isBday ? '🎉 **TODAY!**' : days === 1 ? '⚡ Tomorrow' : `in ${days}d`;
                return `${isBday ? '🎂' : '▸'} **${e.username}** — ${dateStr}  ·  ${tag}`;
            });

            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('🎂 Upcoming Birthdays')
                .setDescription(lines.join('\n'))
                .setFooter({ text: `${enrichedEntries.length} birthday${enrichedEntries.length !== 1 ? 's' : ''} registered` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },
};
