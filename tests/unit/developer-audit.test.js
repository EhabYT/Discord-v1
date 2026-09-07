const { recordDeveloperAction, readDeveloperAudit, flushDeveloperAudit } = require('../../shared/services/developer-audit');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

const marker = `unit-audit-${Date.now()}`;
const req = {
    headers: { 'x-forwarded-for': '10.0.0.9, 10.0.0.10' },
    socket: { remoteAddress: '10.0.0.11' },
    requestId: 'unitREQ123',
    session: { user: { id: '999999999999999999' } },
    systemRole: 'DEVELOPER',
};

console.log('\nDeveloper audit queue:\n');

// Recording returns the event synchronously without touching the filesystem.
const event = recordDeveloperAction(req, marker, 'unit-target', 'success', {
    lines: 3,
    DEV_TOKEN: 'must-not-persist',
});
check('record returns the event synchronously',
    !!event && event.action === marker && event.userId === '999999999999999999');
check('forwarded client IP is preferred over the socket address', event.ip === '10.0.0.9');
check('secret metadata is redacted before queueing', event.metadata?.DEV_TOKEN === '[REDACTED]');

// The pending batch is flushed explicitly and becomes visible to readers.
check('explicit flush persists the pending batch', flushDeveloperAudit() === true);
const found = readDeveloperAudit({ limit: 50, action: marker });
check('flushed event is readable by action filter',
    found.length >= 1 && found[0].target === 'unit-target' && found[0].systemRole === 'DEVELOPER');

// Flushing an empty queue is a no-op success (shutdown path safety).
check('empty flush succeeds', flushDeveloperAudit() === true);

if (fails) { console.log(`\n${fails} CHECK(S) FAILED.`); process.exit(1); }
console.log('\nAll developer-audit checks passed.\n');
