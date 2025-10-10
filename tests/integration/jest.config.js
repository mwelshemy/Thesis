module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapping: {
    // This helps Jest find our modules
    '^vscode$': '<rootDir>/tests/mocks/vscode-mock.js',
  },
  modulePathIgnorePatterns: ['<rootDir>/out/'],
  collectCoverageFrom: ['src/**/*.ts', 'ai/**/*.ts', '!src/**/*.d.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  // Allow longer timeouts for real AI calls
  testTimeout: 30000,
};
