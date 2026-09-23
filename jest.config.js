module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  // webapp/ is a separate Next.js project that runs its own tests under
  // Vitest (see webapp/vitest.config.ts) — without this, Jest also picks up
  // its __tests__/*.test.tsx files and fails trying to load "vitest" via
  // require(), since Jest and Vitest use incompatible module systems here.
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/webapp/',
  ],
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.d.ts',
  ],
};
