/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/tests/**/*.test.js'],
  // Default (5000ms) is too tight for beforeAll/afterAll hooks that start
  // a real mongod process (MongoMemoryServer) - that alone can take
  // several seconds under load, well before any actual test logic runs.
  testTimeout: 20000,
}
