/**
 * ESLint flat config for EB Bot.
 *
 * This project is deliberately two codebases in one repository:
 *   - the bot + Express API, CommonJS, running on Node 22
 *   - the dashboard client, ESM + JSX, built by Vite for the browser
 *
 * They need different globals and different parser options, so they are
 * configured separately rather than forced under one set of rules.
 *
 * RULE SELECTION
 * --------------
 * The point of this gate is to catch the classes of bug this codebase has
 * actually produced — not to enforce a style. Formatting rules are omitted
 * entirely; they generate noise and would bury the findings that matter.
 *
 * Every error-level rule below maps to a real incident recorded in
 * docs/engineering-lessons.md:
 *
 *   no-unused-vars          → dead code left after refactors
 *   require-atomic-updates  → the /pay double-spend (read-modify-write race)
 *   no-return-await, etc.   → async mistakes that swallowed rejections
 *   no-prototype-builtins   → prototype-pollution surface
 *   eqeqeq                  → permission comparisons must not coerce
 *
 * Warnings are for things worth seeing but not worth blocking a deploy.
 */

const js = require('@eslint/js');

/** Node globals available to the bot and API. */
const nodeGlobals = {
    require: 'readonly', module: 'writable', exports: 'writable',
    process: 'readonly', console: 'readonly', Buffer: 'readonly',
    __dirname: 'readonly', __filename: 'readonly', global: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly',
    setInterval: 'readonly', clearInterval: 'readonly',
    setImmediate: 'readonly', queueMicrotask: 'readonly',
    URL: 'readonly', URLSearchParams: 'readonly', TextEncoder: 'readonly',
    fetch: 'readonly', AbortController: 'readonly', structuredClone: 'readonly',
};

/** Browser globals available to the React client. */
const browserGlobals = {
    window: 'readonly', document: 'readonly', navigator: 'readonly',
    localStorage: 'readonly', sessionStorage: 'readonly', location: 'readonly',
    fetch: 'readonly', console: 'readonly', URL: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly',
    setInterval: 'readonly', clearInterval: 'readonly',
    AbortController: 'readonly', Blob: 'readonly', FormData: 'readonly',
    Image: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
    requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
    IntersectionObserver: 'readonly', ResizeObserver: 'readonly',
    WebSocket: 'readonly', EventSource: 'readonly', CustomEvent: 'readonly',
    HTMLElement: 'readonly', getComputedStyle: 'readonly',
};

/** Correctness rules shared by both halves of the project. */
const correctness = {
    // Unused symbols are how dead code accumulates through refactors.
    //
    // `args: 'none'` is deliberate. Every command exports
    // `execute(interaction, client, db)` and every Express handler takes
    // `(req, res, next)` — uniform signatures the loaders depend on. A command
    // that does not need `db` must still accept it, so flagging those would
    // report ~70 false positives and train people to ignore the linter. Unused
    // *variables* — the ones that actually indicate dead code — still error.
    'no-unused-vars': ['error', {
        args: 'none',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',        // `catch (err) {}` with an unused err is idiomatic here
        ignoreRestSiblings: true,    // the `({ authorId, ...rest })` redaction pattern
    }],

    // Async correctness. The /pay double-spend and the vanished event
    // rejections both came from this family of mistake.
    // Flags `get -> await -> set` on the same object. This is exactly the shape
    // of the /pay double-spend, so it stays an error. Where serialisation is
    // provably handled (utils/db_lock.js) the call site carries an inline
    // disable with a justification.
    'require-atomic-updates': 'error',
    'no-async-promise-executor': 'error',
    'no-await-in-loop': 'off',       // deliberate for Discord rate-limit friendliness

    // `new Promise((r) => setTimeout(r, ms))` is the idiomatic sleep and the
    // arrow's return value is meaningless here. The rule cannot distinguish it
    // from a genuine mistake, and every occurrence in this repo is a sleep or a
    // callback-to-promise adapter, so it produces only noise.
    'no-promise-executor-return': 'off',

    'require-await': 'warn',
    'no-return-await': 'warn',

    // Security-adjacent.
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'off',            // commands/math.js uses a strictly allow-listed Function
    'no-prototype-builtins': 'error',
    'no-proto': 'error',
    'no-extend-native': 'error',

    // Comparison safety: permission levels and snowflakes must not coerce.
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-implicit-coercion': 'off',

    // `catch {}` is used deliberately throughout to mean "best effort, failure
    // is acceptable here" — e.g. deleting a channel that may already be gone.
    // Requiring a comment in ~34 places would be churn, not safety. Empty
    // blocks OTHER than catch still error, since those are usually mistakes.
    'no-empty': ['error', { allowEmptyCatch: true }],

    // Genuine bug catchers.
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'no-fallthrough': 'error',
    'no-self-compare': 'error',
    'no-template-curly-in-string': 'warn',
    'no-unsafe-optional-chaining': 'error',
    'no-constant-binary-expression': 'error',
    'array-callback-return': 'error',
    'no-constructor-return': 'error',

    // Style is out of scope, with one exception: a missing brace on a
    // single-line `if` is a real source of logic errors in guard clauses.
    curly: ['warn', 'multi-line'],

    // lib/logger.js strips ANSI escapes and C0 control characters — that IS
    // the log-injection defence, so control characters in those patterns are
    // the point. Flagging them would mean disabling the rule at the one place
    // it looks suspicious and is actually correct.
    'no-control-regex': 'off',
};

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'dashboard/node_modules/**',
            'dashboard/public/**',        // build output, hashed assets
            'vendor/**',                  // reviewed third-party compatibility source
            'logs/**',
            '*.sqlite',
        ],
    },

    // ── Bot + Express API (CommonJS, Node) ──
    {
        files: ['**/*.js'],
        ignores: ['dashboard/**'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: nodeGlobals,
        },
        rules: { ...js.configs.recommended.rules, ...correctness },
    },

    // ── Dashboard client (ESM + JSX, browser) ──
    {
        files: ['dashboard/src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: browserGlobals,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...correctness,
            // JSX components are referenced by the transform, not by name.
            'no-unused-vars': ['error', {
                args: 'none',
                varsIgnorePattern: '^[A-Z_]',
                caughtErrors: 'none',
                ignoreRestSiblings: true,
            }],
        },
    },

    // ── Vite/PostCSS/Tailwind config files are CommonJS in an ESM package ──
    {
        files: ['dashboard/*.config.js'],
        languageOptions: { sourceType: 'module', globals: nodeGlobals },
    },

    // ── Test suites ──
    // The suites mock discord.js, whose methods are async by contract
    // (guild.members.fetch, member.kick, channel.send …). A stub must return a
    // promise to be a faithful double, but has nothing to await. Enforcing
    // require-await here would push authors toward less accurate mocks — the
    // opposite of what the rule is for.
    {
        files: ['tests/**/*.js'],
        rules: { 'require-await': 'off' },
    },
];
