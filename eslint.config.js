// ESLint 9 flat config (CommonJS). Migrated from eslintrc during apps/* monorepo move.
const nodeGlobals = {
  require: 'readonly',
  module: 'readonly',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  performance: 'readonly',
};

module.exports = [
  {
    linterOptions: {
      // The codebase documents concurrency reasoning with eslint-disable
      // comments for rules (require-atomic-updates/require-await) that were
      // never installed. Keep the prose, don't fail on the directives.
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      'apps/web/public/**',
      'apps/web/dist/**',
      '_legacy_or_review/**',
      '**/*.log',
      'backups/**',
      'logs/**',
      'packages/database/supabase/**',
    ],
  },
  {
    files: ['apps/**/*.js', 'packages/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      // ESLint 9 defaults caughtErrors to 'all'; restore v8 behaviour so
      // intentional `catch (e) { /* ignore */ }` fallbacks don't warn.
      // argsIgnorePattern keeps Express (req, res, next) signatures clean.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{jsx,js}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...nodeGlobals, window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly' },
    },
    rules: {},
  },
];
