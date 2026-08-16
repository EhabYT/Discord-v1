const { addClient, broadcast } = require('../../backend/src/utils/sse');

function fakeResponse() {
    return {
        chunks: [],
        headers: null,
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        write(chunk) { this.chunks.push(String(chunk)); },
    };
}

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

console.log('\nGuild-scoped SSE delivery:\n');
const a = fakeResponse();
const b = fakeResponse();
const removeA = addClient(a, '111111111111111111');
const removeB = addClient(b, '222222222222222222');

broadcast('message', { guildId: '111111111111111111', description: 'private-a' });
check('guild A receives its event', a.chunks.some((c) => c.includes('private-a')));
check('guild B cannot receive guild A event', !b.chunks.some((c) => c.includes('private-a')));

broadcast('message', { guildId: '222222222222222222', description: 'private-b' });
check('guild B receives its event', b.chunks.some((c) => c.includes('private-b')));
check('guild A cannot receive guild B event', !a.chunks.some((c) => c.includes('private-b')));
check('SSE disables proxy transformations', a.headers?.['Cache-Control'] === 'no-cache, no-transform');

removeA();
removeB();
console.log(fails === 0 ? '\nAll SSE isolation checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
process.exit(fails === 0 ? 0 : 1);
