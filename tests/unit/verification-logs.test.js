const assert = require('node:assert/strict');
const { applyVerification } = require('../../packages/shared/services/verification');

async function run() {
    const writes = [];
    const db = {
        async get() { return null; },
        async set(key, value) { writes.push([key, value]); },
    };
    const member = {
        id: '123456789012345678',
        displayName: 'Test member',
        toString() { return `<@${this.id}>`; },
        guild: {
            id: '234567890123456789',
            channels: { async fetch() { return null; } },
        },
        user: {
            id: '123456789012345678',
            username: 'test-member',
            tag: 'test-member#0001',
            displayAvatarURL() { return null; },
        },
        roles: { async add() {}, async remove() {} },
    };

    let realtimeEvent = null;
    await applyVerification(member, {}, {
        db,
        emitLog(guildId, event) { realtimeEvent = { guildId, event }; },
    });
    assert.equal(realtimeEvent?.guildId, member.guild.id);
    assert.equal(realtimeEvent?.event?.type, 'member_verified');
    assert.equal(writes.length, 1, 'verification entry should still be persisted');

    await assert.doesNotReject(() => applyVerification(member, {}, {
        db,
        emitLog() { throw new Error('socket unavailable'); },
    }), 'an unavailable realtime socket must not undo successful verification');

    console.log('Verification realtime log checks passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
