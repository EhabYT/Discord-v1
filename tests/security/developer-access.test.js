const {
    SYSTEM_ROLES, baseSystemRole, systemRole, requireSystemRole, redactEnv,
} = require('../../backend/src/middleware/devauth');
const { safeObject } = require('../../shared/services/developer-audit');

const original = {
    OWNER_ID: process.env.OWNER_ID,
    DEVELOPER_IDS: process.env.DEVELOPER_IDS,
    SUPPORT_IDS: process.env.SUPPORT_IDS,
    DEV_TOKEN: process.env.DEV_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
};
process.env.OWNER_ID = '111111111111111111';
process.env.DEVELOPER_IDS = '222222222222222222';
process.env.SUPPORT_IDS = '333333333333333333';
process.env.DEV_TOKEN = 'a'.repeat(64);
process.env.DATABASE_URL = 'postgresql://user:private@host:5432/db';

const req = (id, unlocked = false) => ({
    session: { user: id ? { id } : null, devUnlocked: unlocked },
    headers: {}, socket: { remoteAddress: '127.0.0.1' }, originalUrl: '/api/developer/db',
});
let fails = 0;
const check = (label, ok) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

console.log('\nDeveloper system-role enforcement:\n');
check('owner receives SUPER_ADMIN', baseSystemRole(req('111111111111111111'), null) === SYSTEM_ROLES.SUPER_ADMIN);
check('listed developer requires second-factor unlock',
    baseSystemRole(req('222222222222222222'), null) === SYSTEM_ROLES.DEVELOPER
    && systemRole(req('222222222222222222'), null) === SYSTEM_ROLES.NONE
    && systemRole(req('222222222222222222', true), null) === SYSTEM_ROLES.DEVELOPER);
check('support receives read-only SUPPORT role', systemRole(req('333333333333333333'), null) === SYSTEM_ROLES.SUPPORT);
check('ordinary Discord user has no system role', systemRole(req('444444444444444444'), null) === SYSTEM_ROLES.NONE);

let denied = null;
requireSystemRole(null, SYSTEM_ROLES.DEVELOPER)(req('333333333333333333'), {
    status(code) { denied = { code }; return this; },
    json(body) { denied.body = body; return this; },
}, () => { denied = { passed: true }; });
check('support cannot call developer-only endpoint', denied?.code === 403 && denied.body.required === 'DEVELOPER');

const env = redactEnv();
const dbEnv = env.find((item) => item.key === 'DATABASE_URL');
check('environment endpoint returns no secret suffix', dbEnv?.secret === true && dbEnv.preview === '');
const auditMeta = safeObject({ token: 'secret', databaseUrl: 'private', count: 2 });
check('developer audit metadata redacts secrets',
    auditMeta.token === '[REDACTED]' && auditMeta.databaseUrl === '[REDACTED]' && auditMeta.count === 2);

for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
}
console.log(fails === 0 ? '\nAll developer-access checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
process.exit(fails === 0 ? 0 : 1);
