module.exports = {
    displayName: 'shared-nestjs-utils',
    preset: '../../../jest.preset.js',
    globals: {},
    testEnvironment: 'node',
    // Ensure Jest also tries to resolve paths relative to the workspace root.
    modulePaths: ['../../../'],
    transform: {
        '^.+\\.[tj]sx?$': [
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
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    coverageDirectory: '../../../coverage/libs/shared/nestjs-utils',
};
