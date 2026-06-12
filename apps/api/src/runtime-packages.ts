/**
 * This file exists purely to allow Nx to correctly detect the runtime dependencies.
 *
 * The Nx build executor generates a package.json based on dependency analysis of the
 * application. Without this file the API server will not start and "module
 * not found" errors will be shown in the logs.
 */

import 'tslib';
