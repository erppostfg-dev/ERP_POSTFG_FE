// ESLint (2026-10-28, Phase 0 of the test plan; POST_FG PROJECT_STATUS "Tests + lint").
// Type-aware TypeScript + React hooks rules on OUR code only (Ajay's in-transit / planning screens are left out for
// now, user). Problems that already existed are recorded in eslint-suppressions.json (baseline): new code must be
// clean, old code is fixed over time (`npm run lint:prune` drops entries once fixed).
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**', 'node_modules/**', 'vendor/**', 'certs/**', '*.config.*', 'eslint.config.mjs', '.husky/**',
      // not ours yet (user 2026-10-28): Ajay's in-transit / planning screens and their helpers
      'src/pages/dp/**', 'src/api/intransit.ts', 'src/constants/intransit.ts', 'src/dev/intransitPreview.ts',
      'src/lib/csvTable*.ts', 'src/lib/folderFiles.ts', 'src/lib/sheet35*.ts', 'src/lib/snapshotCache.ts',
      'src/lib/__tests__/csv-table.test.ts', 'src/lib/__tests__/inventory-snapshot.test.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      // hooks: called in the same order every render; effects list what they use (stale data / render loops)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // fast refresh keeps state only when a component file exports components
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      // a promise nobody waits for / catches; an async function passed where a plain callback is expected
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false, attributes: false } }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/require-await': 'off',
      // API JSON is typed at the api/ layer; these flag every untyped parse, not real bugs
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-floating-promises': 'off' },
  },
)
