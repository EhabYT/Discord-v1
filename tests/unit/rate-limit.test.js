const assert = require('assert');
const rl = require('../../apps/api/src/middleware/rate-limit');

const limit = rl.limit('forwarded-header-regression-test', 1, 60_000);
function invoke(ip, forwardedFor) {
  const result = { next: false, statusCode: null, body: null, headers: {} };
  const req = {
    ip,
    headers: { 'x-forwarded-for': forwardedFor },
    socket: { remoteAddress: '127.0.0.1' },
    session: {},
  };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
  limit(req, res, () => { result.next = true; });
  return result;
}

assert.strictEqual(invoke('198.51.100.7', '203.0.113.1').next, true);
const spoofAttempt = invoke('198.51.100.7', '203.0.113.2');
assert.strictEqual(spoofAttempt.statusCode, 429, 'changing raw X-Forwarded-For must not bypass the same client bucket');
assert.strictEqual(spoofAttempt.body.code, 'RATE_LIMITED');
assert.strictEqual(invoke('198.51.100.8', '203.0.113.1').next, true, 'distinct trusted client IPs get separate buckets');

function invokeUser(limit) {
  const result = { next: false, statusCode: null };
  const req = { ip: '198.51.100.9', socket: {}, session: { user: { id: 'account-test' } } };
  const res = {
    setHeader() {},
    status(code) { result.statusCode = code; return this; },
    json() { return this; },
  };
  limit(req, res, () => { result.next = true; });
  return result;
}
const heavyA = rl.heavyRead('independent-a');
const heavyB = rl.heavyRead('independent-b');
for (let i = 0; i < 10; i += 1) assert.strictEqual(invokeUser(heavyA).next, true);
assert.strictEqual(invokeUser(heavyA).statusCode, 429);
assert.strictEqual(invokeUser(heavyB).next, true, 'one expensive route must not consume another route’s allowance');
console.log('Rate-limit trusted-IP and route-isolation checks passed.');
