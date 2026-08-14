#!/usr/bin/env node
/**
 * Lint ratchet.
 *
 * The codebase carries pre-existing lint debt (unused frontend variables, and
 * read-modify-write patterns ESLint cannot prove are serialised). Failing the
 * build on all of it today would mean either disabling the gate or mass-editing
 * files this audit has not reviewed — both worse than the debt itself.
 *
 * So the gate enforces a BUDGET rather than zero: the build fails if the count
 * rises above the recorded baseline. New code cannot add lint errors, and the
 * baseline can only be lowered.
 *
 * When you fix something, run:
 *     node scripts/lint-gate.js --update
 * and commit the lowered numbers.
 *
 *     npm run lint        see everything
 *     npm run lint:gate   enforce the budget (CI)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_FILE = path.join(__dirname, '..', '.lintbaseline.json');

function runEslint() {
    const bin = path.join(__dirname, '..', 'node_modules', '.bin', 'eslint');
    let out;
    try {
        out = execFileSync(bin, ['.', '-f', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
        // ESLint exits non-zero when problems exist; the report is still on stdout.
        out = err.stdout;
        if (!out) {
            console.error('lint gate: could not run eslint\n', err.message);
            process.exit(2);
        }
    }
    const report = JSON.parse(out);
    let errors = 0;
    let warnings = 0;
    const byRule = {};
    for (const file of report) {
        for (const m of file.messages) {
            const rule = m.ruleId || '(syntax)';
            byRule[rule] = (byRule[rule] || 0) + 1;
            if (m.severity === 2) errors += 1; else warnings += 1;
        }
    }
    return { errors, warnings, byRule };
}

const current = runEslint();
const update = process.argv.includes('--update');

if (update || !fs.existsSync(BASELINE_FILE)) {
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({
        note: 'Lint debt budget. Lower it when you fix things; never raise it.',
        errors: current.errors,
        warnings: current.warnings,
        byRule: current.byRule,
    }, null, 2)}\n`);
    console.log(`lint gate: baseline written — ${current.errors} errors, ${current.warnings} warnings`);
    process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
const errDelta = current.errors - baseline.errors;
const warnDelta = current.warnings - baseline.warnings;

console.log(`lint gate: ${current.errors} errors (budget ${baseline.errors}), `
    + `${current.warnings} warnings (budget ${baseline.warnings})`);

if (errDelta > 0 || warnDelta > 0) {
    console.error('\nlint gate FAILED — new lint problems were introduced.\n');
    for (const [rule, n] of Object.entries(current.byRule)) {
        const was = baseline.byRule[rule] || 0;
        if (n > was) console.error(`  ${rule}: ${was} -> ${n}`);
    }
    console.error('\nFix them, or run `node scripts/lint-gate.js --update` if the '
        + 'increase is genuinely justified.\n');
    process.exit(1);
}

if (errDelta < 0 || warnDelta < 0) {
    console.log(`lint gate: improved by ${-errDelta} errors / ${-warnDelta} warnings — `
        + 'run `node scripts/lint-gate.js --update` to lock in the gain.');
}
process.exit(0);
