const { formatWelcomeVars } = require('../../shared/utils/welcome-vars');

let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

const member = {
    id: '111111111111111111',
    user: { username: 'NewMember' },
    guild: { name: 'EB Store', memberCount: 1234 },
};
const inviter = { id: '222222222222222222', username: 'Inviter' };

console.log('\nWelcome template variables:\n');
check('curly tokens resolve',
    formatWelcomeVars('Hi {user} ({userName}) @ {guild} #{count}', { member })
    === 'Hi <@111111111111111111> (NewMember) @ EB Store #1234');
check('ProBot bracket aliases resolve',
    formatWelcomeVars('Hi [user] ([userName]) @ [server] #[memberCount]', { member })
    === 'Hi <@111111111111111111> (NewMember) @ EB Store #1234');
check('inviter tokens resolve on join',
    formatWelcomeVars('invited by {inviter} ({inviterName})', { member, inviter })
    === 'invited by <@222222222222222222> (Inviter)');
check('missing inviter falls back to Unknown',
    formatWelcomeVars('invited by {inviter} ({inviterName})', { member })
    === 'invited by Unknown (Unknown)');
check('unknown tokens are left untouched',
    formatWelcomeVars('Hello {user}, today is {day}!', { member })
    === 'Hello <@111111111111111111>, today is {day}!');
check('non-string templates pass through',
    formatWelcomeVars(null, { member }) === null && formatWelcomeVars('', { member }) === '');
check('leave messages resolve without an inviter',
    formatWelcomeVars('{userName} left [server] ({count})', { member })
    === 'NewMember left EB Store (1234)');

if (fails) { console.log(`\n${fails} CHECK(S) FAILED.`); process.exit(1); }
console.log('\nAll welcome-variable checks passed.\n');
