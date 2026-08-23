const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const nodeVersion = read('.node-version').trim();
const render = read('render.yaml');
const workflow = read('.github/workflows/verify.yml');

const failures = [];
function requireCondition(condition, message) {
    if (!condition) failures.push(message);
}

function requireMatch(source, pattern, message) {
    requireCondition(pattern.test(source), message);
}

function renderEnvironment() {
    const entries = new Map();
    const lines = render.split(/\r?\n/);
    let current = null;
    for (const line of lines) {
        const key = line.match(/^\s+- key:\s*(\S+)\s*$/);
        if (key) {
            current = { properties: new Map() };
            entries.set(key[1], current);
            continue;
        }
        if (!current) continue;
        const property = line.match(/^\s+(\w+):\s*(.*?)\s*$/);
        if (property) current.properties.set(property[1], property[2].replace(/^['"]|['"]$/g, ''));
    }
    return entries;
}

console.log('\nRelease and deployment configuration:\n');

requireCondition(pkg.engines?.node === '22.12.x', 'package.json must pin Node to 22.12.x');
requireCondition(nodeVersion === '22.12.0', '.node-version must pin Node to 22.12.0');
requireMatch(render, /^\s*buildCommand:\s*npm ci\s*$/m,
    'Render must use npm ci; root postinstall owns the single Dashboard build');
requireMatch(render, /^\s*startCommand:\s*npm start\s*$/m, 'Render startCommand must remain npm start');
requireMatch(render, /^\s*healthCheckPath:\s*\/api\/health\s*$/m,
    'Render healthCheckPath must remain /api/health');

const env = renderEnvironment();
const expectedValues = {
    NODE_VERSION: '22.12.0',
    NODE_ENV: 'production',
    DASHBOARD_AUTH: 'true',
    DASHBOARD_SECURE: 'true',
    EMAIL_PROVIDER: 'resend',
};
for (const [key, expected] of Object.entries(expectedValues)) {
    requireCondition(env.get(key)?.properties.get('value') === expected,
        `Render ${key} must be ${expected}`);
}

const externalSecrets = [
    'DATABASE_URL', 'DISCORD_TOKEN', 'CLIENT_ID', 'DISCORD_CLIENT_SECRET',
    'OWNER_ID', 'DEVELOPER_IDS', 'SUPPORT_IDS', 'DEV_TOKEN', 'EMAIL_FROM', 'RESEND_API_KEY',
];
for (const key of externalSecrets) {
    const entry = env.get(key);
    requireCondition(entry?.properties.get('sync') === 'false',
        `Render secret ${key} must use sync: false and contain no committed value`);
    requireCondition(!entry?.properties.has('value'),
        `Render secret ${key} must not contain a literal value`);
}
requireCondition(env.get('SESSION_SECRET')?.properties.get('generateValue') === 'true',
    'Render SESSION_SECRET must be generated');
requireCondition(!env.get('SESSION_SECRET')?.properties.has('value'),
    'Render SESSION_SECRET must not contain a literal value');

requireMatch(workflow, /^on:\s*$/m, 'CI workflow must declare triggers');
requireMatch(workflow, /^\s{2}push:\s*$/m, 'CI workflow must run on pushes');
requireMatch(workflow, /^\s{2}pull_request:\s*$/m, 'CI workflow must run on pull requests');
requireMatch(workflow, /^\s{2}workflow_dispatch:\s*$/m, 'CI workflow must support manual dispatch');
requireMatch(workflow, /^permissions:\s*\n\s{2}contents:\s*read\s*$/m,
    'CI permissions must be read-only');
requireMatch(workflow, /^\s{2}cancel-in-progress:\s*true\s*$/m,
    'CI must cancel stale branch/PR runs');
requireMatch(workflow, /^\s{4}timeout-minutes:\s*(?:[1-9]|1\d|20)\s*$/m,
    'CI job timeout must be between 1 and 20 minutes');
requireMatch(workflow, /node-version-file:\s*\.node-version/,
    'CI must use the repository Node version pin');
requireMatch(workflow, /persist-credentials:\s*false/,
    'CI checkout must not persist credentials');
requireMatch(workflow, /run:\s*npm ci --ignore-scripts/,
    'CI must install root dependencies from the lockfile without postinstall duplication');
requireMatch(workflow, /run:\s*npm --prefix dashboard ci --ignore-scripts/,
    'CI must install Dashboard dependencies from its lockfile');
requireMatch(workflow, /run:\s*npm run verify/,
    'CI must execute the authoritative release gate');
requireCondition(!workflow.includes('${{ secrets.'),
    'credential-free verification must not depend on GitHub secrets');

const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map(match => match[1]);
requireCondition(actionRefs.length === 2, 'CI must use only the two reviewed official setup actions');
for (const reference of actionRefs) {
    requireCondition(/^actions\/(?:checkout|setup-node)@[0-9a-f]{40}$/.test(reference),
        `GitHub Action must be official and pinned to a full commit SHA: ${reference}`);
}
requireCondition(actionRefs.includes('actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09'),
    'checkout must remain pinned to the reviewed v5 commit');
requireCondition(actionRefs.includes('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38'),
    'setup-node must remain pinned to the reviewed v6 commit');

const verify = pkg.scripts?.verify || '';
for (const command of ['npm run validate:release', 'npm run lint:gate', 'npm test',
    'npm run audit:prod', 'npm run build:dashboard']) {
    requireCondition(verify.includes(command), `npm run verify must include: ${command}`);
}

if (failures.length) {
    for (const failure of failures) console.error(`  FAIL  ${failure}`);
    console.error(`\n${failures.length} release configuration check(s) failed.\n`);
    process.exit(1);
}

console.log('  PASS  Node pins agree at 22.12.0');
console.log('  PASS  Render build/start/health/auth contract is valid');
console.log('  PASS  Render secrets contain no committed values');
console.log('  PASS  CI triggers, permissions, timeout, and cancellation are bounded');
console.log('  PASS  GitHub Actions are pinned to reviewed immutable commits');
console.log('  PASS  CI and local verification use the same authoritative gate');
console.log('\nAll release configuration checks passed.\n');
