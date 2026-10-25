const assert = require('assert');
const { mapInBatches } = require('../../packages/shared/utils/async');

(async () => {
  let active = 0;
  let maximum = 0;
  const input = Array.from({ length: 17 }, (_, i) => i);
  const output = await mapInBatches(input, 4, async (value, index) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, value % 3));
    active -= 1;
    return `${index}:${value}`;
  });
  assert(maximum <= 4, `expected max concurrency <= 4, got ${maximum}`);
  assert.deepStrictEqual(output, input.map((value, index) => `${index}:${value}`));
  await assert.rejects(mapInBatches(input, 0, async (value) => value), /positive integer/);
  console.log('Bounded async mapping checks passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
