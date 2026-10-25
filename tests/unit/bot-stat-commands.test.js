const assert = require('assert');
const leaderboard = require('../../apps/bot/src/commands/utility/leaderboard');
const serverstats = require('../../apps/bot/src/commands/community/serverstats');

(async () => {
  const calls = [];
  let reply;
  const interaction = {
    guild: {
      id: '123456789012345678',
      name: 'Test Guild',
      memberCount: 42,
      iconURL: () => null,
    },
    options: { getString: () => null },
    async deferReply() {},
    async editReply(value) { reply = value; },
  };
  const db = {
    async topPrefix(prefix, options) {
      calls.push(['topPrefix', prefix, options]);
      return [{
        id: `${prefix}223456789012345678`,
        value: { messages: 20, voiceTime: 120_000, reactions: 3 },
      }];
    },
    async aggregateStatsPrefix(prefix) {
      calls.push(['aggregateStatsPrefix', prefix]);
      return { totalMessages: 20, totalVoice: 120_000, totalReactions: 3, activeUsers: 1 };
    },
  };

  await leaderboard.execute(interaction, null, db);
  assert.deepStrictEqual(calls[0], ['topPrefix', 'stats_123456789012345678_', { sort: 'total', limit: 10 }]);
  assert.match(reply.embeds[0].data.description, /<@223456789012345678> — 25/);

  await serverstats.execute(interaction, null, db);
  assert.deepStrictEqual(calls[1], ['aggregateStatsPrefix', 'stats_123456789012345678_']);
  assert.strictEqual(reply.embeds[0].data.fields.find((field) => field.name === '📊 Active').value, '1');
  assert.strictEqual(reply.embeds[0].data.fields.find((field) => field.name === '📝 Messages').value, '20');

  console.log('Bounded leaderboard and server-stat command checks passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
