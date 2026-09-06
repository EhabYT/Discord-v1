/**
 * Regression tests for the file-type dependency.
 *
 * History: the repo previously carried a vendored `vendor/file-type` copy with
 * a backported guard against an infinite loop — the 16.x ASF parser rewinds to
 * the start of a sub-header forever when its declared size is zero, blocking
 * the event loop (DoS) on a crafted 96-byte input. The vendored copy was
 * retired in favour of the npm registry release.
 *
 * Verified 2026-09: `file-type@18.7.0` still hangs on the proof input below
 * (child killed by timeout, event loop blocked), while `file-type@22.0.2`
 * returns `undefined` immediately. The dependency is therefore pinned to the
 * fixed major. The package is ESM-only, so both probes below use dynamic
 * `import()` from this CommonJS test file.
 *
 * Known upstream exposure (not ours to patch): `@discord-player/extractor`
 * still bundles a nested `file-type@16.5.4` which hangs on the same proof
 * input. No first-party code calls file-type directly — the only in-repo
 * consumer is this test — so the exposure is limited to media bytes the music
 * extractor itself chooses to sniff. Tracked here so a future extractor bump
 * can drop this note.
 */

const { spawnSync } = require('child_process');

let fails = 0;
function check(label, ok, detail = '') {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

console.log('\nfile-type dependency checks:\n');

// The vulnerable parser moves back to the beginning of the sub-header
// forever when its declared size is zero. Run the proof in a child process so
// this regression test itself has a hard deadline if the guard regresses.
const proof = `
    (async () => {
        const { fileTypeFromBuffer } = await import('file-type');
        const malformed = Buffer.alloc(96);
        Buffer.from([0x30,0x26,0xB2,0x75,0x8E,0x66,0xCF,0x11,0xA6,0xD9]).copy(malformed, 0);
        // Bytes 46..53 are already zero: the sub-header at offset 30 declares size 0.
        const result = await fileTypeFromBuffer(malformed);
        if (result !== undefined) process.exit(2);
        process.exit(0);
    })().catch(() => process.exit(3));
`;
const child = spawnSync(process.execPath, ['--input-type=module', '-e', proof], {
    encoding: 'utf8',
    timeout: 8000,
});
check('zero-size ASF sub-header terminates without looping', child.status === 0,
    child.error?.code || `exit=${child.status} signal=${child.signal}`);

(async () => {
    const { fileTypeFromBuffer } = await import('file-type');
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
    const detected = await fileTypeFromBuffer(jpeg);
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
