const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');

module.exports = defineConfig([
  ...expoConfig,
  {
    // Jest globals (it/expect/describe/...) for test files -- nothing else
    // in this config declares a test environment, so __tests__/*.js otherwise
    // reads `it`/`expect` as undefined globals.
    files: ['**/__tests__/**', '**/*.test.*'],
    languageOptions: { globals: globals.jest },
  },
  {
    // Ignore generated, vendored, and Deno-specific code.
    // Deno edge functions use Deno globals (Deno.env, etc.) that Node ESLint
    // doesn't understand — they have their own toolchain (deno check).
    // webapp/** has its own separate eslint.config/`.eslintrc` and CI job.
    ignores: [
      'node_modules/**',
      'webapp/**',
      'services/**',
      'supabase/functions/**',
      '.expo/**',
      'expo-env.d.ts',
    ],
  },
  {
    // Flat config validates each object's rules against its own `plugins`
    // entry independently -- referencing "@typescript-eslint/*" rules
    // without redeclaring the plugin here (even though expoConfig already
    // registers it for .ts/.tsx elsewhere) fails at config-load time, not
    // per-file, so this must carry its own plugin reference.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // Enforced: no any in new code (existing violations are pre-existing)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused variables are a sign of dead code or missing wiring
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    rules: {
      // Prevent accidental console.log commits
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
