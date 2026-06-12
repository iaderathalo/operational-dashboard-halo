/* eslint-disable no-param-reassign */
const { composePlugins, withNx } = require('@nx/webpack');
const path = require('path');

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), (config) => {
    // Replace dd-trace with a no-op stub for local development.
    // dd-trace's require-in-the-middle hooks break ESM packages
    // used by polaris-logger (serialize-error, uuid).
    if (process.env.NODE_ENV !== 'production') {
        const noopPath = path.resolve(__dirname, 'src/trace-noop.js');

        // Remove dd-trace from externals so webpack bundles our stub instead
        if (Array.isArray(config.externals)) {
            config.externals = config.externals.filter((ext) => {
                if (typeof ext === 'function') return true;
                if (typeof ext === 'string') return ext !== 'dd-trace';
                if (typeof ext === 'object' && ext !== null) {
                    delete ext['dd-trace'];
                }
                return true;
            });
        }

        // Alias dd-trace to no-op
        config.resolve = config.resolve || {};
        config.resolve.alias = config.resolve.alias || {};
        config.resolve.alias['dd-trace'] = noopPath;
    }
    return config;
});
