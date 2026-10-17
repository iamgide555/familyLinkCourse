module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {'^.+\\.tsx?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.json', useESM: true}]},
  moduleNameMapper: {'^(\\.{1,2}/.*)\\.js$': '$1'},
  testTimeout: 20000,
  clearMocks: true
};
