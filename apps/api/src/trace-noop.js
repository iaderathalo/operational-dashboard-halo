// No-op stub for dd-trace in local development.
// dd-trace's require-in-the-middle hooks break ESM packages.
module.exports = {
    init: () => module.exports,
    use: () => module.exports,
    trace: () => module.exports,
    wrap: () => module.exports,
    startSpan: () => ({}),
    scope: () => ({ active: () => null }),
};
module.exports.default = module.exports;
