const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const root = path.join(__dirname, '..', '..');
const { loadCommands } = require(path.join(root, 'apps/bot/src/handlers/command-loader'));
const { attachClientErrorHandler } = require(path.join(root, 'apps/bot/src/handlers/client-errors'));
const { loadEvents } = require(path.join(root, 'apps/bot/src/events'));

const logger = { debug() {}, error() {} };
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-command-loader-'));
try {
  fs.mkdirSync(path.join(temp, 'a'));
  fs.mkdirSync(path.join(temp, 'b'));
  fs.writeFileSync(path.join(temp, 'a', 'first.js'), "module.exports = { data: { name: 'same' }, execute() {} };\n");
  fs.writeFileSync(path.join(temp, 'b', 'second.js'), "module.exports = { data: { name: 'same' }, execute() {} };\n");

  assert.throws(() => loadCommands(temp, new Map(), logger), /Duplicate command name "same"/);
  console.log('  PASS  duplicate command names fail startup instead of overwriting');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const client = new EventEmitter();
client.player = { events: new EventEmitter() };
const unrelated = () => {};
client.on('unrelated-test-event', unrelated);
loadEvents(client);
const counts = (emitter) => Object.fromEntries(
  emitter.eventNames().map((name) => [String(name), emitter.listenerCount(name)])
);
const clientCounts = counts(client);
const playerCounts = counts(client.player.events);
loadEvents(client);
assert.deepStrictEqual(counts(client), clientCounts);
assert.deepStrictEqual(counts(client.player.events), playerCounts);
assert.strictEqual(client.listenerCount('unrelated-test-event'), 1);
console.log('  PASS  repeated event loading replaces only this loader’s client/player listeners');

const errorClient = new EventEmitter();
const errors = [];
const detachErrorHandler = attachClientErrorHandler(errorClient, {
  error(message, details) { errors.push({ message, details }); },
});
errorClient.emit('error', new Error('gateway test failure'));
assert.strictEqual(errors.length, 1);
assert.strictEqual(errors[0].message, 'Discord client error');
assert.strictEqual(errors[0].details.error, 'gateway test failure');
detachErrorHandler();
assert.strictEqual(errorClient.listenerCount('error'), 0);
console.log('  PASS  Discord client errors are logged and handler can be detached cleanly');

console.log('\nBot loader regression checks passed.');
