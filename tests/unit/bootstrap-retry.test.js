const assert = require('assert');
const {
  DEFAULT_MAX_RETRIES,
  MAX_CONFIGURED_RETRIES,
  maxRetriesFromEnv,
  retryDelay,
} = require('../../apps/bot/src/handlers/bootstrap-retry');

assert.strictEqual(maxRetriesFromEnv(undefined), DEFAULT_MAX_RETRIES);
assert.strictEqual(maxRetriesFromEnv(''), DEFAULT_MAX_RETRIES);
assert.strictEqual(maxRetriesFromEnv('6'), 6);
assert.strictEqual(maxRetriesFromEnv('0'), DEFAULT_MAX_RETRIES);
assert.strictEqual(maxRetriesFromEnv('21'), DEFAULT_MAX_RETRIES);
assert.strictEqual(maxRetriesFromEnv('nope'), DEFAULT_MAX_RETRIES);
assert.strictEqual(MAX_CONFIGURED_RETRIES, 20);
assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7].map(retryDelay), [
  15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000,
]);
assert.throws(() => retryDelay(0), /positive integer/);

console.log('Bounded bootstrap retry policy checks passed.');
