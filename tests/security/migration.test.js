const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const source = path.join(os.tmpdir(), `eb-legacy-${process.pid}.sqlite`);
try { fs.unlinkSync(source); } catch { /* absent */ }

const create = spawnSync(process.env.PYTHON || 'python3', ['-c', `
import sqlite3, json
c=sqlite3.connect(${JSON.stringify(source)})
c.execute('CREATE TABLE json (ID TEXT PRIMARY KEY, json TEXT)')
c.execute('INSERT INTO json VALUES (?,?)', ('welcome_123', json.dumps({'enabled': True})))
c.execute('INSERT INTO json VALUES (?,?)', ('points_123_456', json.dumps(42)))
c.commit(); c.close()
`], { encoding: 'utf8' });

let fails = 0;
const check = (label, ok, detail = '') => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('\nLegacy SQLite → Supabase migration tool:\n');
check('legacy fixture was created', create.status === 0, create.stderr);
const migrate = spawnSync(process.execPath, [
    path.join(__dirname, '..', '..', 'scripts', 'migrate-sqlite-to-postgres.js'),
    '--source', source, '--dry-run',
], { encoding: 'utf8', timeout: 10_000 });
check('dry run validates legacy records', migrate.status === 0 && /Validated 2 legacy records/.test(migrate.stdout),
    migrate.stderr || migrate.stdout);
check('dry run does not require DATABASE_URL', !/DATABASE_URL is required/.test(migrate.stderr));
check('migration leaves the SQLite backup untouched', fs.existsSync(source));

try { fs.unlinkSync(source); } catch { /* ignore cleanup */ }
console.log(fails === 0 ? '\nAll migration checks passed.\n' : `\n${fails} CHECK(S) FAILED.\n`);
process.exit(fails === 0 ? 0 : 1);
