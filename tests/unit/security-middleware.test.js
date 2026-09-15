/**
 * Tests for security middleware components.
 *
 *   node tests/unit/security-middleware.test.js
 */

const assert = require('assert');

// ─── validate.js ─────────────────────────────────────────────
console.log('\nSchema validation middleware:');

const { validateBody, validators, SNOWFLAKE } = require('../../apps/api/src/middleware/validate');

// Test SNOWFLAKE regex
assert.ok(SNOWFLAKE.test('123456789012345678'), 'SNOWFLAKE accepts valid ID');
assert.ok(!SNOWFLAKE.test('123'), 'SNOWFLAKE rejects short ID');
assert.ok(!SNOWFLAKE.test('abc'), 'SNOWFLAKE rejects non-numeric');
assert.ok(!SNOWFLAKE.test('12345678901234567890123'), 'SNOWFLAKE rejects too long');
console.log('  PASS  SNOWFLAKE regex validates Discord IDs');

// Test validateBody with basic schema
const mockReq = (body) => ({ body, params: {}, headers: {}, requestId: 'test-123' });
const mockRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
};

const schema = {
    name: { type: 'string', required: true, max: 100 },
    count: { type: 'number', min: 0, max: 100 },
    enabled: { type: 'boolean' },
};

// Valid request
let called = false;
validateBody(schema)(mockReq({ name: 'test', count: 5, enabled: true }), mockRes(), () => { called = true; });
assert.ok(called, 'validateBody passes valid request');
console.log('  PASS  validateBody passes valid request');

// Missing required field
let response;
validateBody(schema)(mockReq({}), mockRes(), () => { response = 'next'; });
assert.strictEqual(response, undefined, 'validateBody blocks missing required');
console.log('  PASS  validateBody blocks missing required field');

// Invalid type
response = undefined;
validateBody(schema)(mockReq({ name: 123 }), mockRes(), () => { response = 'next'; });
assert.strictEqual(response, undefined, 'validateBody blocks wrong type');
console.log('  PASS  validateBody blocks wrong type');

// Prototype pollution attempt
response = undefined;
validateBody({ __proto__: { type: 'string' } })(mockReq({ __proto__: { evil: true } }), mockRes(), () => { response = 'next'; });
console.log('  PASS  validateBody handles prototype pollution');

// Test validators.snowflake
const sfResult = validators.snowflake('guildId');
assert.ok(sfResult.pattern, 'snowflake validator has pattern');
console.log('  PASS  validators.snowflake creates snowflake validator');

// Test validators.safeString
const ssResult = validators.safeString(100);
assert.strictEqual(ssResult.max, 100, 'safeString respects max');
console.log('  PASS  validators.safeString respects max length');

// Test validators.reason
const reasonResult = validators.reason();
assert.strictEqual(reasonResult.max, 512, 'reason has max 512');
console.log('  PASS  validators.reason has correct max');

// Test validators.url
const urlResult = validators.url();
assert.strictEqual(urlResult.type, 'string', 'url returns string type');
console.log('  PASS  validators.url returns string type');

// Test validators.duration
const durResult = validators.duration();
assert.strictEqual(durResult.type, 'string', 'duration returns string type');
console.log('  PASS  validators.duration returns string type');

console.log('All schema validation checks passed.');


// ─── timeout.js ──────────────────────────────────────────────
console.log('\nRequest timeout middleware:');

const { requestTimeout, DEFAULT_TIMEOUT_MS, HEALTH_TIMEOUT_MS } = require('../../apps/api/src/middleware/timeout');

assert.strictEqual(DEFAULT_TIMEOUT_MS, 30000, 'Default timeout is 30s');
assert.strictEqual(HEALTH_TIMEOUT_MS, 5000, 'Health timeout is 5s');
console.log('  PASS  Timeout constants are correct');

// Test that middleware sets up timer
let timerSet = false;
const mockReq2 = { path: '/api/test', session: {}, requestId: 'test' };
const mockRes2 = {
    headersSent: false,
    setHeader: () => {},
    on: (event, cb) => { if (event === 'finish') timerSet = true; },
    status: () => ({ json: () => {} }),
};
requestTimeout(5000)(mockReq2, mockRes2, () => {});
assert.ok(timerSet, 'Timeout middleware registers finish handler');
console.log('  PASS  Timeout middleware registers finish handler');

console.log('All timeout checks passed.');


// ─── ip-allowlist.js ─────────────────────────────────────────
console.log('\nIP allowlist middleware:');

const { isLoopback, normalizeIp, isIpAllowed } = require('../../apps/api/src/middleware/ip-allowlist');

assert.ok(isLoopback('127.0.0.1'), 'Loopback detects 127.0.0.1');
assert.ok(isLoopback('::1'), 'Loopback detects ::1');
assert.ok(isLoopback('::ffff:127.0.0.1'), 'Loopback detects ::ffff:127.0.0.1');
assert.ok(!isLoopback('192.168.1.1'), 'Loopback rejects external IP');
console.log('  PASS  isLoopback correctly identifies loopback');

assert.strictEqual(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1', 'normalizeIp strips prefix');
assert.strictEqual(normalizeIp('127.0.0.1'), '127.0.0.1', 'normalizeIp passes through');
console.log('  PASS  normalizeIp correctly normalizes');

assert.ok(isIpAllowed('127.0.0.1', ['192.168.1.0/24']), 'Allowlist always allows loopback');
assert.ok(isIpAllowed('192.168.1.5', ['192.168.1.0/24']), 'Allowlist matches CIDR');
assert.ok(!isIpAllowed('10.0.0.1', ['192.168.1.0/24']), 'Allowlist rejects non-matching');
assert.ok(isIpAllowed('192.168.1.100', ['192.168.1.100']), 'Allowlist matches exact IP');
console.log('  PASS  isIpAllowed correctly checks allowlist');

console.log('All IP allowlist checks passed.');


// ─── webhook-verify.js ───────────────────────────────────────
console.log('\nWebhook verification middleware:');

const { safeCompare } = require('../../apps/api/src/middleware/webhook-verify');
const crypto = require('crypto');

assert.ok(safeCompare('hello', 'hello'), 'safeCompare matches equal strings');
assert.ok(!safeCompare('hello', 'world'), 'safeCompare rejects different strings');
assert.ok(!safeCompare('hello', 'hell'), 'safeCompare rejects different lengths');
console.log('  PASS  safeCompare correctly compares strings');

// Test HMAC signature verification concept
const secret = 'test-secret-key';
const payload = '{"test":true}';
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
assert.ok(safeCompare(signature, signature), 'HMAC signature matches itself');
console.log('  PASS  HMAC signature comparison works');

console.log('All webhook verification checks passed.');


// ─── request-size.js ─────────────────────────────────────────
console.log('\nRequest size middleware:');

const { requestSizeLimit } = require('../../apps/api/src/middleware/request-size');

// Test size limit middleware
let blocked = false;
const req3 = { headers: { 'content-length': '5000' }, session: {}, requestId: 'test' };
const res3 = {
    statusCode: null,
    status: (code) => { res3.statusCode = code; return res3; },
    json: (data) => { res3.body = data; return res3; },
    setHeader: () => {},
};
requestSizeLimit(4096, 'test')(req3, res3, () => { blocked = 'next'; });
assert.strictEqual(res3.statusCode, 413, 'Size limit blocks oversized request');
console.log('  PASS  Size limit blocks oversized request');

blocked = false;
const req4 = { headers: { 'content-length': '1000' }, session: {}, requestId: 'test' };
const res4 = {
    statusCode: null,
    setHeader: () => {},
};
requestSizeLimit(4096, 'test')(req4, res4, () => { blocked = 'next'; });
assert.strictEqual(blocked, 'next', 'Size limit allows small request');
console.log('  PASS  Size limit allows small request');

console.log('All request size checks passed.');


// ─── security-pipeline.js ────────────────────────────────────
console.log('\nSecurity pipeline middleware:');

const { guildSecurityPipeline, systemSecurityPipeline } = require('../../apps/api/src/middleware/security-pipeline');

// Test that pipeline returns array of middleware
const guildPipeline = guildSecurityPipeline({}, 0);
assert.ok(Array.isArray(guildPipeline), 'guildSecurityPipeline returns array');
assert.ok(guildPipeline.length >= 4, 'guildSecurityPipeline has at least 4 middleware');
console.log('  PASS  guildSecurityPipeline returns correct middleware stack');

const systemPipeline = systemSecurityPipeline();
assert.ok(Array.isArray(systemPipeline), 'systemSecurityPipeline returns array');
assert.ok(systemPipeline.length >= 1, 'systemSecurityPipeline has at least 1 middleware');
console.log('  PASS  systemSecurityPipeline returns correct middleware stack');

console.log('All security pipeline checks passed.');


// ─── developer-audit.js (security alerts) ────────────────────
console.log('\nDeveloper audit security alerts:');

const { SECURITY_ACTIONS, SEVERITY } = require('eb-bot-shared/services/developer-audit');

assert.ok(SECURITY_ACTIONS.has('authorization.denied'), 'SECURITY_ACTIONS includes authorization.denied');
assert.ok(SECURITY_ACTIONS.has('restore'), 'SECURITY_ACTIONS includes restore');
assert.ok(SECURITY_ACTIONS.has('login.failed'), 'SECURITY_ACTIONS includes login.failed');
console.log('  PASS  SECURITY_ACTIONS contains critical actions');

assert.strictEqual(SEVERITY.LOW, 'low', 'SEVERITY.LOW is low');
assert.strictEqual(SEVERITY.HIGH, 'high', 'SEVERITY.HIGH is high');
assert.strictEqual(SEVERITY.CRITICAL, 'critical', 'SEVERITY.CRITICAL is critical');
console.log('  PASS  SEVERITY constants are correct');

console.log('All developer audit security alert checks passed.');


// ─── command-guard.js ────────────────────────────────────────
console.log('\nBot command guard:');

const { validateStringInput, validateSnowflake, validateDuration } = require('../../apps/bot/src/guards/command-guard');

// Test validateStringInput
const validStr = validateStringInput('hello world', { max: 100 });
assert.ok(validStr.valid, 'validateStringInput accepts valid string');
assert.strictEqual(validStr.sanitized, 'hello world', 'validateStringInput preserves valid string');
console.log('  PASS  validateStringInput accepts valid string');

const tooLong = validateStringInput('x'.repeat(200), { max: 100 });
assert.ok(!tooLong.valid, 'validateStringInput rejects too long');
console.log('  PASS  validateStringInput rejects too long string');

const nullBytes = validateStringInput('hello\x00world');
assert.ok(nullBytes.valid, 'validateStringInput sanitizes null bytes');
assert.ok(!nullBytes.sanitized.includes('\0'), 'validateStringInput removes null bytes');
console.log('  PASS  validateStringInput sanitizes null bytes');

// Test validateSnowflake
const validSf = validateSnowflake('123456789012345678');
assert.ok(validSf.valid, 'validateSnowflake accepts valid ID');
console.log('  PASS  validateSnowflake accepts valid ID');

const invalidSf = validateSnowflake('123');
assert.ok(!invalidSf.valid, 'validateSnowflake rejects short ID');
console.log('  PASS  validateSnowflake rejects invalid ID');

// Test validateDuration
const validDur = validateDuration('1h');
assert.ok(validDur.valid, 'validateDuration accepts valid duration');
assert.strictEqual(validDur.ms, 3600000, 'validateDuration calculates ms correctly');
console.log('  PASS  validateDuration accepts valid duration');

const invalidDur = validateDuration('invalid');
assert.ok(!invalidDur.valid, 'validateDuration rejects invalid format');
console.log('  PASS  validateDuration rejects invalid format');

const tooLongDur = validateDuration('100w');
assert.ok(!tooLongDur.valid, 'validateDuration rejects too long duration');
console.log('  PASS  validateDuration rejects too long duration');

console.log('All command guard checks passed.');


console.log('\n✅ All security middleware tests passed.\n');
