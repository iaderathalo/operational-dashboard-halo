module.exports = {
    displayName: 'shared-api-model',
    preset: '../../../jest.preset.js',
    globals: {},
    testEnvironment: 'node',
    modulePaths: ['../../../'],
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
            },
        ],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
    coverageDirectory: '../../../coverage/libs/shared/api',
};
