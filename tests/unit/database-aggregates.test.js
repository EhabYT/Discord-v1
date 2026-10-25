const assert = require('assert');
const { MemoryDatabase, PostgresDatabase } = require('../../packages/database');

(async () => {
  const memory = new MemoryDatabase();
  await memory.set('stats_guild_1', { messages: 20, voiceTime: 120_000, reactions: 3 });
  await memory.set('stats_guild_2', { messages: 10, voiceTime: 180_000, reactions: 8 });
  await memory.set('stats_guild_3', { messages: 'bad', voiceTime: 0, reactions: 0 });
  await memory.set('stats_other_1', { messages: 1000, voiceTime: 0, reactions: 0 });

  assert.deepStrictEqual(await memory.aggregateStatsPrefix('stats_guild_'), {
    totalMessages: 30,
    totalVoice: 300_000,
    totalReactions: 11,
    activeUsers: 2,
  });
  const top = await memory.topPrefix('stats_guild_', { sort: 'total', limit: 2 });
  assert.deepStrictEqual(top.map((row) => row.id), ['stats_guild_1', 'stats_guild_2']);
  assert.throws(() => memory.topPrefix('stats_guild_', { sort: 'unsafe' }), /unknown top sort/);

  const lockOrder = [];
  const lockedTask = (name) => memory.withAdvisoryLocks(['same-key'], async () => {
    lockOrder.push(`${name}:start`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    lockOrder.push(`${name}:end`);
  });
  await Promise.all([lockedTask('first'), lockedTask('second')]);
  assert.deepStrictEqual(lockOrder, ['first:start', 'first:end', 'second:start', 'second:end'],
    'the in-memory fallback serializes critical sections that share a lock key');

  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql: String(sql), params });
      if (/COALESCE\(SUM/.test(String(sql))) {
        return { rows: [{ total_messages: '30', total_voice: '300000', total_reactions: '11', active_users: 2 }] };
      }
      if (/ORDER BY/.test(String(sql))) {
        return { rows: [{ id: 'stats_guild_2', value: { messages: 10, voiceTime: 180_000, reactions: 8 } }] };
      }
      throw new Error('Unexpected SQL in aggregate contract test');
    },
  };
  const postgres = new PostgresDatabase(pool, { initialized: true });
  assert.deepStrictEqual(await postgres.aggregateStatsPrefix('stats_guild_'), {
    totalMessages: 30,
    totalVoice: 300_000,
    totalReactions: 11,
    activeUsers: 2,
  });
  const postgresTop = await postgres.topPrefix('stats_guild_', { sort: 'total', limit: 10 });
  assert.strictEqual(postgresTop[0].id, 'stats_guild_2');
  assert(queries[0].sql.includes('SUM('), 'server-wide totals are aggregated in SQL');
  assert(!queries[0].sql.includes('SELECT key AS id'), 'aggregate does not transfer JSONB rows');
  assert(queries[1].sql.includes('ORDER BY'), 'leaderboard ranking is database-side');
  assert.deepStrictEqual(queries[1].params, ['stats\\_guild\\_%', 10]);

  console.log('Database aggregate and total-leaderboard checks passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
