const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const path = require('path');
const glob = require('glob');
const fs = require('fs');

const rootPackageJsonPath = path.join(process.cwd(), 'package.json');
const generatedPackageJsonPath = path.join(process.cwd(), 'dist/apps/api-e2e/package.json');

const copyOverridesToPackageJson = () => {
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8'));

    if (rootPackageJson.overrides) {
        let generatedPackageJson = {};
        if (fs.existsSync(generatedPackageJsonPath)) {
            generatedPackageJson = JSON.parse(fs.readFileSync(generatedPackageJsonPath, 'utf-8'));
        }
        generatedPackageJson.overrides = rootPackageJson.overrides;
        fs.writeFileSync(generatedPackageJsonPath, JSON.stringify(generatedPackageJson, null, 2));
    }
};
module.exports = {
    output: {
        path: path.join(process.cwd(), 'dist/apps/api-e2e'),
    },
    plugins: [
        new NxAppWebpackPlugin({
            target: 'node',
            compiler: 'tsc',
            main: './src/main.ts',
            tsConfig: './tsconfig.spec.json',
            optimization: false,
            outputHashing: 'none',
            generatePackageJson: true,
        }),
        {
            apply: (compiler) => {
                compiler.hooks.done.tap('CopyOverridesPlugin', () => {
                    copyOverridesToPackageJson();
                });
            },
        },
    ],
    entry: {
        ...glob.sync(path.join(__dirname, 'src/*.e2e.ts')).reduce((acc, file) => {
            acc[path.parse(file).name] = file;
            return acc;
        }, {}),
    },
};
