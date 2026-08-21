const {
    config, validateBotConfig, containsProfanity, normalizedWords,
} = require('../../shared/config/bot-config');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

console.log('\nVersioned bot configuration:\n');
check('schema V2 loads with identity and accessible colors',
    config.schemaVersion === 2 && config.identity.version === '2.0.0' && /^#[0-9A-F]{6}$/i.test(config.colors.primary));
check('runtime config is deeply immutable',
    Object.isFrozen(config) && Object.isFrozen(config.colors) && Object.isFrozen(config.automod.profanity.terms));
check('whole-word matching blocks explicit terms', containsProfanity('This is FUCK!') === true);
check('substring false positives are eliminated',
    containsProfanity('class assignment and assistant') === false);
check('leet normalization follows configuration', containsProfanity('f4gg0t') === true);
check('Unicode normalization produces stable words', normalizedWords('Café', config.automod.profanity)[0] === 'cafe');

const invalid = structuredClone(config);
invalid.colors.primary = 'red';
check('invalid colors fail startup validation', (() => {
    try { validateBotConfig(invalid); return false; } catch { return true; }
})());

console.log(fails === 0 ? '\nAll bot-config checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
process.exit(fails === 0 ? 0 : 1);
