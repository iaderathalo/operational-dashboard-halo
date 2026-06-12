/**
 * This file exists purely to allow Nx to correctly detect the runtime dependencies.
 *
 * The Nx build executor generates a package.json based on dependency analysis of the
 * application. That application includes this file and anything it imports, but does
 * not include the test files (which are injected directly into the Webpack config as
 * Nx only supports a single entrypoint).
 * If new dependencies are added to the tests, they will need to be added here before
 * they will be available in the deployed image.
 */

import 'jest';
import 'supertest';
import 'tslib';
