/** Regression tests for locally backported dependency security fixes. */

const path = require('path');
const { spawnSync } = require('child_process');

let fails = 0;
function check(label, ok, detail = '') {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

console.log('\nPatched file-type compatibility package:\n');

// The vulnerable 16.x parser moves back to the beginning of the sub-header
// forever when its declared size is zero. Run the proof in a child process so
// this regression test itself has a hard deadline if the guard is removed.
const root = path.join(__dirname, '..', '..');
const proof = `
    const fileType = require('./vendor/file-type');
    const malformed = Buffer.alloc(96);
    Buffer.from([0x30,0x26,0xB2,0x75,0x8E,0x66,0xCF,0x11,0xA6,0xD9]).copy(malformed, 0);
    // Bytes 46..53 are already zero: the sub-header at offset 30 declares size 0.
    fileType.fromBuffer(malformed).then((result) => {
        if (result !== undefined) process.exit(2);
        process.exit(0);
    }).catch(() => process.exit(3));
`;
const child = spawnSync(process.execPath, ['-e', proof], {
    cwd: root,
    encoding: 'utf8',
    timeout: 2000,
});
check('zero-size ASF sub-header terminates without looping', child.status === 0,
    child.error?.code || `exit=${child.status} signal=${child.signal}`);

const fileType = require('../../vendor/file-type');
(async () => {
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
    const detected = await fileType.fromBuffer(jpeg);
    check('normal file detection remains compatible', detected?.ext === 'jpg' && detected?.mime === 'image/jpeg',
        JSON.stringify(detected));

    console.log(fails === 0
        ? '\nAll dependency patch checks passed.\n'
        : `\n${fails} CHECK(S) FAILED.\n`);
    process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
