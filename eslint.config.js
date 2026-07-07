const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    // Ignore generated, vendored, and Deno-specific code.
    // Deno edge functions use Deno globals (Deno.env, etc.) that Node ESLint
    // doesn't understand — they have their own toolchain (deno check).
    ignores: [
      'node_modules/**',
      'webapp/node_modules/**',
      'supabase/functions/**',
      '.expo/**',
      'expo-env.d.ts',
    ],
  },
  {
    rules: {
      // Enforced: no any in new code (existing violations are pre-existing)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prevent accidental console.log commits
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Unused variables are a sign of dead code or missing wiring
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]);
