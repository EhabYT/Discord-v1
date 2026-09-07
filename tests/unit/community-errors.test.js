const polls = require('../../shared/services/polls');
const tags = require('../../shared/services/tags');
const confessions = require('../../shared/services/confessions');
const { classify } = require('../../backend/src/middleware/errors');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

function memDb(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        get: async (k) => (store.has(k) ? store.get(k) : null),
        set: async (k, v) => { store.set(k, v); },
    };
}

function mkGuild() {
    const posted = {
        id: 'msg1',
        react: async () => {},
        edit: async () => {},
        delete: async () => {},
    };
    const channel = {
        id: 'chan1',
        send: async () => posted,
        messages: { fetch: async () => posted },
    };
    return {
        id: 'guild1',
        channels: {
            cache: new Map([['chan1', channel]]),
            fetch: async () => channel,
        },
    };
}

const grab = (promise) => promise.then(() => null, (err) => err);

(async () => {
    console.log('\nPoll service errors:\n');
    const guild = mkGuild();

    check('poll without channel rejects with 400',
        (await grab(polls.create(guild, memDb(), { question: 'q?' })))?.status === 400);
    check('poll without question rejects with 400',
        (await grab(polls.create(guild, memDb(), { channelId: 'chan1' })))?.status === 400);
    check('poll with one option rejects with 400',
        (await grab(polls.create(guild, memDb(), { channelId: 'chan1', question: 'q?', options: ['only'] })))?.status === 400);
    check('closing unknown poll rejects with 404',
        (await grab(polls.close(guild, memDb(), 'nope')))?.status === 404);
    check('removing unknown poll rejects with 404',
        (await grab(polls.remove(guild, memDb(), 'nope')))?.status === 404);

    console.log('\nTag service errors:\n');
    check('tag without name rejects with 400',
        (await grab(tags.upsert(memDb(), 'guild1', '   ', 'content')))?.status === 400);
    check('tag without content rejects with 400',
        (await grab(tags.upsert(memDb(), 'guild1', 'faq', '  ')))?.status === 400);
    check('removing unknown tag rejects with 404',
        (await grab(tags.remove(memDb(), 'guild1', 'nope')))?.status === 404);

    console.log('\nConfession service errors:\n');
    check('disabled confessions reject with 400',
        (await grab(confessions.create(guild, memDb({
            confession_config_guild1: { enabled: false },
        }), { message: 'hi' })))?.status === 400);
    check('empty confession rejects with 400',
        (await grab(confessions.create(guild, memDb({
            confession_config_guild1: { enabled: true, channelId: 'chan1' },
        }), { message: '  ' })))?.status === 400);
    check('missing channel rejects with 400',
        (await grab(confessions.create(guild, memDb({
            confession_config_guild1: { enabled: true },
        }), { message: 'hi' })))?.status === 400);
    check('removing unknown confession rejects with 404',
        (await grab(confessions.remove(guild, memDb(), 'nope')))?.status === 404);

    // Cooldown is rate-limiting, not a crash: 429 with a human message.
    const cdDb = memDb({
        confession_config_guild1: { enabled: true, channelId: 'chan1', cooldownMinutes: 60 },
        confession_cooldown_guild1_u1: Date.now(),
    });
    const cd = await grab(confessions.create(guild, cdDb, {
        message: 'again', authorId: 'u1', authorTag: 'u#1',
    }));
    check('cooldown rejects with 429', cd?.status === 429);
    const cdMapped = classify(cd);
    check('cooldown maps to 429 COOLDOWN',
        cdMapped.status === 429 && cdMapped.code === 'COOLDOWN'
        && /wait/i.test(cdMapped.message));

    console.log('\nCommunity happy paths:\n');
    const tdb = memDb();
    const tag = await tags.upsert(tdb, 'guild1', 'FAQ', 'read this');
    check('tag upserts', tag?.name === 'faq');
    check('unknown tag maps to 404 via classify',
        classify(await grab(tags.remove(memDb(), 'guild1', 'nope'))).status === 404);
    check('tag removes', (await tags.remove(tdb, 'guild1', 'faq'))?.success === true);

    const pdb = memDb();
    const poll = await polls.create(guild, pdb, { channelId: 'chan1', question: 'Best?', options: ['a', 'b'] });
    check('poll creates open', !!poll?.id && poll.closed === false);
    const closed = await polls.close(guild, pdb, poll.id);
    check('poll closes with results', closed.closed === true && Array.isArray(closed.liveResults));

    const cdb = memDb({ confession_config_guild1: { enabled: true, channelId: 'chan1' } });
    const entry = await confessions.create(guild, cdb, { message: 'secret' });
    check('confession creates without author by default',
        !!entry?.id && entry.authorId === null);

    if (fails) { console.log(`\n${fails} CHECK(S) FAILED.`); process.exit(1); }
    console.log('\nAll community-error checks passed.\n');
})().catch((err) => { console.error(err); process.exit(1); });
