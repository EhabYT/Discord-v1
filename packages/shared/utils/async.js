/**
 * Map an array while bounding the number of concurrently running mapper calls.
 * Results retain input order. Batching deliberately waits for the current
 * chunk before starting the next, which keeps external API fan-out predictable.
 */
async function mapInBatches(items, batchSize, mapper) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive integer');
  }
  if (typeof mapper !== 'function') throw new TypeError('mapper must be a function');

  const results = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const chunk = items.slice(start, start + batchSize);
    const mapped = await Promise.all(chunk.map((item, offset) => mapper(item, start + offset)));
    results.push(...mapped);
  }
  return results;
}

module.exports = { mapInBatches };
