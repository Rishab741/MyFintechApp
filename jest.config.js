const { getDefaultConfig } = require('jest-expo');

const config = {
  ...getDefaultConfig(__dirname),
  // Run .test.ts / .test.tsx files inside any __tests__ folder
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  // Collect coverage only from src/lib — the business logic we own
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    '!src/lib/**/*.d.ts',
  ],
  // jest-expo handles the transform; we extend rather than override
  setupFilesAfterFramework: [],
};

module.exports = config;
