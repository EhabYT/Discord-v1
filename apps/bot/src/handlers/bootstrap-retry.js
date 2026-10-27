const DEFAULT_MAX_RETRIES = 8;
const MAX_CONFIGURED_RETRIES = 20;
const BASE_DELAY_MS = 15_000;
const MAX_DELAY_MS = 5 * 60_000;

function maxRetriesFromEnv(value) {
  if (value == null || String(value).trim() === '') return DEFAULT_MAX_RETRIES;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CONFIGURED_RETRIES) {
    return DEFAULT_MAX_RETRIES;
  }
  return parsed;
}

function retryDelay(retryNumber) {
  if (!Number.isInteger(retryNumber) || retryNumber < 1) {
    throw new RangeError('retryNumber must be a positive integer');
  }
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** Math.min(retryNumber - 1, 5)));
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  MAX_CONFIGURED_RETRIES,
  maxRetriesFromEnv,
  retryDelay,
};
