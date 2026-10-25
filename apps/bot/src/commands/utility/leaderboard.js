const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const STAT_PREFIX = 'stats_';

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreFor(value, type) {
  if (type === 'messages') return numeric(value?.messages);
  if (type === 'voice') return Math.floor(numeric(value?.voiceTime) / 60_000);
  return numeric(value?.messages)
    + Math.floor(numeric(value?.voiceTime) / 60_000)
    + numeric(value?.reactions);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View server leaderboard')
    .addStringOption((opt) => opt.setName('type').setDescription('Type')
      .addChoices(
        { name: 'Messages', value: 'messages' },
        { name: 'Voice', value: 'voice' },
        { name: 'Total', value: 'total' },
      )),

  async execute(interaction, _client, db) {
    const type = interaction.options.getString('type') || 'total';
    const prefix = `${STAT_PREFIX}${interaction.guild.id}_`;
    await interaction.deferReply();

    // Rank in PostgreSQL (or the equivalent in-memory adapter) and transfer
    // only the top ten rows. The old implementation fetched every guild member
    // and then one stats record per member, causing unbounded gateway/DB work.
    const rows = await db.topPrefix(prefix, { sort: type, limit: 10 });
    const top10 = rows.map((row) => ({
      userId: row.id.slice(prefix.length),
      value: scoreFor(row.value, type),
    }));
    const medals = ['🥇', '🥈', '🥉'];
    const description = top10.length
      ? top10.map((entry, index) => `${medals[index] || `**${index + 1}.**`} <@${entry.userId}> — ${type === 'voice' ? `${entry.value} min` : entry.value.toLocaleString()}`).join('\n')
      : 'No data yet.';
    const titles = { messages: '📝 Messages', voice: '🎤 Voice Time', total: '🏆 Total' };
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`${titles[type] || titles.total} Leaderboard`)
      .setDescription(description)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};
