module.exports = {
    displayName: 'api',
    preset: '../../jest.preset.js',
    globals: {},
    testEnvironment: 'node',
    // Ensure Jest also tries to resolve paths relative to the workspace root.
    modulePaths: ['../../'],
    transform: {
        '^.+\\.[tj]s$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
            },
        ],
    },
    transformIgnorePatterns: ['node_modules/(?!.*(serialize-error|error-constructors|uuid))'],
    moduleNameMapper: {
        '^rxjs': 'node_modules/rxjs/dist/bundles/rxjs.umd.js',
        '^uuid$': require.resolve('uuid'),
    },
    moduleFileExtensions: ['ts', 'js', 'html'],
    coverageDirectory: '../../coverage/apps/api',
};
