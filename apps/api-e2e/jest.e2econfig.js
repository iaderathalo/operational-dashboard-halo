const baseJestConfig = require('./jest.config');

// This file is supplied as the jest config within the 'system-test' command for the project.
module.exports = {
    ...baseJestConfig,
    // Update the testMatch glob to ensure it matches files suffixed with 'e2e' for this project.
    // Using a different suffix ensures Jest doesn't try to run these tests locally.
    // This glob is based upon the default provided by Jest:
    // https://jestjs.io/docs/configuration#testregex-string--arraystring
    testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(e2e|test|spec).[jt]s?(x)'],
};
