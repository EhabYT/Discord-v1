const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withKeyLock, withKeyLocks, _chains } = require('../../database/lock');

const root = path.join(__dirname, '..', '..');

(async () => {
    console.log('\nCross-instance transaction lock contract:\n');

    const calls = [];
    const transactionDb = { marker: 'dedicated-client' };
    const database = {
        async withAdvisoryLocks(keys, fn) {
            calls.push(keys);
            return fn(transactionDb);
        },
    };

    const received = await withKeyLocks(['points_z', 'points_a', 'points_z'], async (lockedDb) => {
        assert.strictEqual(lockedDb, transactionDb,
            'the callback must receive the database bound to the advisory-lock transaction');
        return 'committed';
    }, database);
    assert.strictEqual(received, 'committed');
    assert.deepStrictEqual(calls, [['points_a', 'points_z']],
        'the local and PostgreSQL layers must use the same sorted, deduplicated key order');

    await withKeyLock('giveaways_1', async (lockedDb) => {
        assert.strictEqual(lockedDb, transactionDb);
    }, database);
    assert.deepStrictEqual(calls[1], ['giveaways_1']);

    const expected = new Error('operation failed');
    await assert.rejects(
        withKeyLock('failed-key', async () => { throw expected; }, database),
        err => err === expected,
        'wrapper must preserve transaction callback errors',
    );
    const recovered = await withKeyLock('failed-key', async () => 'recovered', database);
    assert.strictEqual(recovered, 'recovered', 'a failed operation must not wedge its local queue');

    await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(_chains.size, 0, 'all process-local lock queues must drain');

    const protectedSources = [
        'bot/src/commands/pay.js',
        'bot/src/commands/points.js',
        'bot/src/commands/slots.js',
        'bot/src/commands/work.js',
        'bot/src/commands/giveaway.js',
        'backend/src/routes/guilds.js',
        'shared/services/scheduler-jobs.js',
    ];
    for (const relative of protectedSources) {
        const source = fs.readFileSync(path.join(root, relative), 'utf8');
        assert.match(source, /withKeyLocks?\(/, `${relative} must retain a critical-section wrapper`);
        assert.match(source, /lockedDb/, `${relative} must use the transaction-bound database adapter`);
    }

    const giveawayCommand = fs.readFileSync(path.join(root, 'bot/src/commands/giveaway.js'), 'utf8');
    const guildRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/guilds.js'), 'utf8');
    const scheduler = fs.readFileSync(path.join(root, 'shared/services/scheduler-jobs.js'), 'utf8');
    assert.doesNotMatch(giveawayCommand, /await db\.set\(giveawaysKey/,
        'Discord giveaway mutations must not bypass the transaction adapter');
    assert.doesNotMatch(guildRoutes, /await db\.set\(`giveaways_/,
        'Dashboard giveaway mutations must not bypass the transaction adapter');
    assert.doesNotMatch(scheduler, /await db\.set\(`giveaways_/,
        'scheduled giveaway finalization must not bypass the transaction adapter');

    console.log('  PASS  callback receives the dedicated transaction adapter');
    console.log('  PASS  lock keys are sorted and deduplicated');
    console.log('  PASS  failures preserve errors and release local queues');
    console.log('  PASS  critical economy/giveaway paths retain transaction wrappers');
    console.log('\nAll transaction-lock contract checks passed.\n');
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
