const suggestions = require('../../shared/services/suggestions');
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

(async () => {
    console.log('\nSuggestion service errors:\n');
    const guild = mkGuild();

    // Validation failures carry HTTP semantics for the dashboard API…
    const noChannel = await suggestions.create(guild, memDb(), { message: 'hi' }).then(
        () => null, (err) => err);
    check('missing channel rejects with 400', noChannel?.status === 400);
    check('missing channel message is actionable',
        noChannel?.message === 'Set a suggestions channel first');

    const empty = await suggestions.create(guild, memDb({
        suggestion_config_guild1: { channelId: 'chan1' },
    }), { message: '   ' }).then(() => null, (err) => err);
    check('empty suggestion rejects with 400', empty?.status === 400);

    const unknown = await suggestions.setStatus(guild, memDb(), 'nope', 'approved').then(
        () => null, (err) => err);
    check('unknown id rejects with 404', unknown?.status === 404);
    check('unknown id message is actionable', unknown?.message === 'Suggestion not found');

    const removed = await suggestions.remove(guild, memDb(), 'nope').then(
        () => null, (err) => err);
    check('removing unknown id rejects with 404', removed?.status === 404);

    const badStatus = await suggestions.setStatus(guild, memDb(), 'x', 'maybe').then(
        () => null, (err) => err);
    check('invalid status rejects with 400', badStatus?.status === 400);

    // …and the error middleware honours them instead of masking as 500.
    const mapped = classify(noChannel);
    check('classify preserves the service status', mapped.status === 400);
    check('classify preserves the actionable message',
        mapped.message === 'Set a suggestions channel first');
    check('classify does not report INTERNAL', mapped.code !== 'INTERNAL');

    const mapped404 = classify(unknown);
    check('classify preserves 404 with code',
        mapped404.status === 404 && mapped404.code === 'SUGGESTION_NOT_FOUND');

    // Plain unexpected errors still mask as internal.
    const masked = classify(new Error('ENOENT: open \'/srv/secret.json\''));
    check('unexpected errors still mask as 500 INTERNAL',
        masked.status === 500 && masked.code === 'INTERNAL'
        && !masked.message.includes('/srv/secret.json'));

    console.log('\nSuggestion happy path:\n');
    const db2 = memDb({ suggestion_config_guild1: { channelId: 'chan1' } });
    const item = await suggestions.create(guild, db2, {
        message: 'More emotes', authorId: 'u1', authorTag: 'u#1',
    });
    check('create stores a pending suggestion',
        !!item?.id && item.status === 'pending' && item.messageId === 'msg1');

    const listed = await suggestions.list(db2, 'guild1');
    check('created suggestion is listed', listed.length === 1 && listed[0].id === item.id);

    const approved = await suggestions.setStatus(guild, db2, item.id, 'approved', {
        note: 'good idea', reviewedBy: 'mod#1',
    });
    check('approve updates status and note',
        approved.status === 'approved' && approved.reviewNote === 'good idea');

    const gone = await suggestions.remove(guild, db2, item.id);
    check('remove succeeds', gone?.success === true);
    check('removed suggestion is gone', (await suggestions.list(db2, 'guild1')).length === 0);

    if (fails) { console.log(`\n${fails} CHECK(S) FAILED.`); process.exit(1); }
    console.log('\nAll suggestion checks passed.\n');
})().catch((err) => { console.error(err); process.exit(1); });
