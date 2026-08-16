/**
 * Regression tests for concurrent read-modify-write safety.
 *
 * quick.db has no atomic read-modify-write, and every `await` is a yield point,
 * so `get -> mutate -> set` loses updates under concurrency. Measured on this
 * project's wrapper: five concurrent "+1" increments settle at 1.
 *
 * For XP that is a correctness bug. For the points economy it is a security
 * bug: /pay read the balance, awaited, checked it, then wrote. Two concurrent
 * invocations both pass the same check and both debit the same points, so the
 * sender spends them twice and the recipients keep the full amount — value
 * duplication out of nothing.
 *
 *   node tests/security/concurrency.test.js
 */

const { withKeyLock, withKeyLocks, _chains } = require('../../database/lock');
const { db } = require('../../database/index');

const GUILD = '111111111111111111';
const SENDER = 'sender';
const R1 = 'recipient1';
const R2 = 'recipient2';

const key = (u) => `points_${GUILD}_${u}`;

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

/** The /pay logic, with the lock — mirrors commands/pay.js. */
async function payLocked(from, to, amount) {
    return withKeyLocks([key(from), key(to)], async () => {
        const balance = Number(await db.get(key(from))) || 0;
        if (balance < amount) return { ok: false };
        await db.set(key(from), balance - amount);
        await new Promise((r) => setTimeout(r, 5));          // simulate I/O
        await db.set(key(to), (Number(await db.get(key(to))) || 0) + amount);
        return { ok: true };
    });
}

/** The original, unlocked logic — kept to prove the bug is real. */
async function payUnlocked(from, to, amount) {
    const balance = Number(await db.get(key(from))) || 0;
    if (balance < amount) return { ok: false };
    await new Promise((r) => setTimeout(r, 5));
    await db.set(key(from), balance - amount);
    await db.set(key(to), (Number(await db.get(key(to))) || 0) + amount);
    return { ok: true };
}

async function reset() {
    await db.set(key(SENDER), 100);
    await db.set(key(R1), 0);
    await db.set(key(R2), 0);
}

async function total() {
    const [s, a, b] = await Promise.all([
        db.get(key(SENDER)), db.get(key(R1)), db.get(key(R2)),
    ]);
    return { sender: Number(s) || 0, r1: Number(a) || 0, r2: Number(b) || 0,
             sum: (Number(s) || 0) + (Number(a) || 0) + (Number(b) || 0) };
}

(async () => {
    console.log('\nBaseline — the unlocked implementation duplicates value:\n');

    await reset();
    await Promise.all([payUnlocked(SENDER, R1, 100), payUnlocked(SENDER, R2, 100)]);
    const bad = await total();
    check('unlocked double-spend IS reproducible', bad.sum > 100,
        `sender=${bad.sender} r1=${bad.r1} r2=${bad.r2} total=${bad.sum} (started with 100)`);

    console.log('\nWith the lock, points are conserved:\n');

    await reset();
    const results = await Promise.all([
        payLocked(SENDER, R1, 100),
        payLocked(SENDER, R2, 100),
    ]);
    const good = await total();
    const accepted = results.filter((r) => r.ok).length;

    check('exactly one of two racing payments succeeds', accepted === 1, `accepted=${accepted}`);
    check('sender is fully debited', good.sender === 0, `sender=${good.sender}`);
    check('only one recipient was credited', (good.r1 === 100) !== (good.r2 === 100),
        `r1=${good.r1} r2=${good.r2}`);
    check('total points conserved (no duplication)', good.sum === 100, `total=${good.sum}`);

    console.log('\nGiveaway finalisation must not lose updates:\n');

    // The scheduler ('giveaways' job, every 10s) and the dashboard end/reroll
    // routes both read giveaways_<guild>, mutate an entry and write the whole
    // array back. Concurrently finalising two different giveaways loses one
    // side's write, leaving a finished giveaway marked active — it is then
    // drawn a SECOND time and the prize awarded twice.
    const GKEY = `giveaways_${GUILD}`;
    const seed = () => db.set(GKEY, [
        { messageId: 'm1', active: true }, { messageId: 'm2', active: true },
    ]);

    // Unlocked baseline: prove the race is real, so the assertion below cannot
    // pass vacuously.
    await seed();
    const raceFinalise = async (id, delay) => {
        const gs = await db.get(GKEY);
        await new Promise((r) => setTimeout(r, delay));
        gs.find((g) => g.messageId === id).active = false;
        await db.set(GKEY, gs);
    };
    await Promise.all([raceFinalise('m1', 20), raceFinalise('m2', 10)]);
    const unlockedLeft = (await db.get(GKEY)).filter((g) => g.active).map((g) => g.messageId);
    check('unlocked giveaway race IS reproducible', unlockedLeft.length > 0,
        `still active: ${JSON.stringify(unlockedLeft)}`);

    await seed();
    const lockedFinalise = (id, delay) => withKeyLock(GKEY, async () => {
        const gs = await db.get(GKEY);
        await new Promise((r) => setTimeout(r, delay));
        gs.find((g) => g.messageId === id).active = false;
        await db.set(GKEY, gs);
    });
    await Promise.all([lockedFinalise('m1', 20), lockedFinalise('m2', 10)]);
    const lockedLeft = (await db.get(GKEY)).filter((g) => g.active).map((g) => g.messageId);
    check('locked finalisation loses no update', lockedLeft.length === 0,
        `still active: ${JSON.stringify(lockedLeft)}`);
    await db.delete(GKEY).catch(() => {});

    console.log('\nLock semantics:\n');

    await db.set('conc_counter', { n: 0 });
    const bump = () => withKeyLock('conc_counter', async () => {
        const v = await db.get('conc_counter');
        await new Promise((r) => setTimeout(r, 4));
        v.n += 1;
        await db.set('conc_counter', v);
    });
    await Promise.all(Array.from({ length: 10 }, bump));
    const counter = await db.get('conc_counter');
    check('10 concurrent increments all land', counter.n === 10, `n=${counter.n}`);

    const started = Date.now();
    await Promise.all(['ka', 'kb', 'kc', 'kd'].map((k) =>
        withKeyLock(k, () => new Promise((r) => setTimeout(r, 60)))));
    const elapsed = Date.now() - started;
    check('independent keys stay concurrent', elapsed < 150, `${elapsed}ms for 4x60ms`);

    // A thrown callback must not wedge the queue for that key.
    await withKeyLock('kfail', async () => { throw new Error('boom'); }).catch(() => {});
    const after = await withKeyLock('kfail', async () => 'recovered');
    check('a failed holder does not poison the key', after === 'recovered');

    await new Promise((r) => setTimeout(r, 20));
    check('lock map is released after use', _chains.size === 0, `size=${_chains.size}`);

    await Promise.all([
        db.delete(key(SENDER)), db.delete(key(R1)), db.delete(key(R2)),
        db.delete('conc_counter'),
    ]).catch(() => {});

    console.log(fails === 0
        ? '\nAll concurrency checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})();
