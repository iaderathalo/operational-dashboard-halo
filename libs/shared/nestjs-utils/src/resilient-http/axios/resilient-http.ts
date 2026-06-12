import { setTimeout as sleep } from 'node:timers/promises';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { AxiosInstance, AxiosError } from 'axios';

import ResilientHttpAxiosRequestConfig from './ResilientHttpAxiosRequestConfig';
import ResilientHttpConfig from './ResilientHttpConfig';
import ResilientHttpConfigDefault from './ResilientHttpConfigDefault';
import ResilientHttpConfigOverride from './ResilientHttpConfigOverride';
import ResilientHttpState from './ResilientHttpState';

/**
 * Returns the library default resilient HTTP configuration to use.
 * @returns {ResilientHttpConfig} The library default configuration.
 */
export function getDefaultResilientHttpConfig(): ResilientHttpConfig {
    return {
        default: {
            methods: ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'],
            retries: 3,
            retryDelayMs: 1000,
            responseStatusCodes: [401, 403, 404, 500],
            exponent: 1,
        },
    };
}

/**
 * Calculates and returns the delay (in milliseconds) to use between retries. When the
 * exponent is greater than 1, a delay is calculated which increases exponentially
 * as the retryNumber increases. In all other cases, the initialIntervalMs is returned.
 * @param {number} exponent The exponent to use when calculating retries for use with exponential back-off.
 * @param {number} retryNumber The current retry number.
 * @param {number} initialIntervalMs The initial interval to use between retries (in milliseconds).
 * @returns {number} The retry delay to use (in milliseconds).
 */
export function calculateRetryDelay(
    exponent: number,
    retryNumber: number,
    initialIntervalMs: number
): number {
    const offsetRetryNumber = retryNumber - 1;
    return exponent ** offsetRetryNumber * initialIntervalMs || initialIntervalMs;
}

/**
 * Parses the provided resilient HTTP config and ensures there is always a 'default' property within the config.
 * When no default is provided in the supplied config, the library default is used. Also ensures
 * the 'override' property is always present (defaulting to an empty array).
 * @param {ResilientHttpConfig} resilientHttpConfig The resilient HTTP config to be parsed.
 * @param {Logger} logger The logger to use.
 * @returns {object} The parsed resilient HTTP config.
 */
export function getParsedResilientHttpConfig(
    resilientHttpConfig: ResilientHttpConfig,
    logger?: Logger
) {
    let useLibraryDefaults = false;

    // When there is either no config, or the config has no defaults set, use our own defaults.
    if (!resilientHttpConfig?.default) {
        logger?.debug(
            'No default configuration values provided in resilient HTTP configuration, using library defaults.'
        );

        useLibraryDefaults = true;
    }

    const defaultToUse = useLibraryDefaults
        ? getDefaultResilientHttpConfig().default
        : resilientHttpConfig.default;

    return { default: defaultToUse, overrides: resilientHttpConfig?.overrides || [] };
}

/**
 * Gets the state of the resilient HTTP request from the provided request config,
 * initializing the state as required.
 * @param {ResilientHttpAxiosRequestConfig} requestConfig The resilient HTTP request config to get the state from.
 * @returns {ResilientHttpState} The resilient HTTP state.
 */
function getResilientHttpState(requestConfig: ResilientHttpAxiosRequestConfig): ResilientHttpState {
    const currentState = requestConfig.resilientHttpState || ({} as ResilientHttpState);
    currentState.retryNumber = currentState.retryNumber || 0;
    // eslint-disable-next-line no-param-reassign
    requestConfig.resilientHttpState = currentState;

    return currentState;
}

/**
 * Checks whether or not the given resilient HTTP config entry is applicable
 * for the given Axios error.
 * @param {ResilientHttpConfigDefault | ResilientHttpConfigOverride} entry The resilient HTTP config entry to check.
 * @param {AxiosError} error The Axios HTTP error.
 * @returns {boolean} A boolean representing whether or not the entry is applicable.
 */
export function isConfigEntryApplicable(
    entry: ResilientHttpConfigDefault | ResilientHttpConfigOverride,
    error: AxiosError
): boolean {
    // Coerce the type of the entry to be an override to overcome typescript
    // errors for urlRegexes not being present on the ResilientHttpConfigDefault type.
    const castEntry = entry as ResilientHttpConfigOverride;

    const requestUrlMatchesOverride = castEntry?.urlRegexes
        ? castEntry.urlRegexes.some((urlRegex) => {
              const regex = new RegExp(urlRegex);
              return regex.test(error.config.url);
          })
        : true;

    const requestMethodMatchesOverride = castEntry.methods.some(
        (method) =>
            // Use localeCompare to ensure the check is case-insensitive.
            method.localeCompare(error.config.method, undefined, { sensitivity: 'base' }) === 0
    );

    const responseStatusCodeMatchesOverride = castEntry.responseStatusCodes.includes(
        error.response?.status
    );

    return (
        requestUrlMatchesOverride &&
        requestMethodMatchesOverride &&
        responseStatusCodeMatchesOverride
    );
}

/**
 * Gets a Promise to perform the next retry HTTP request if the maximum
 * number of retries hasn't been reached.
 * @param {AxiosInstance} axiosRef The Axios instance to use.
 * @param {ResilientHttpConfigOverride | ResilientHttpConfigDefault} configEntry Either the Default or Override config entry to get the retry values from.
 * @param {AxiosError} error The Axios HTTP error.
 * @param {Logger} logger The Logger to be optionally used.
 * @returns {Promise<unknown>} A Promise that resolves to the retry request result, or null when the maximum number of retries has been reached.
 */
async function getRetryPromise(
    axiosRef: AxiosInstance,
    configEntry: ResilientHttpConfigOverride | ResilientHttpConfigDefault,
    error: AxiosError,
    logger?: Logger
): Promise<unknown> {
    const currentState = getResilientHttpState(error.config);
    if (currentState.retryNumber < configEntry.retries) {
        currentState.retryNumber += 1;

        const retryDelayMs = calculateRetryDelay(
            configEntry.exponent,
            currentState.retryNumber,
            configEntry.retryDelayMs
        );

        // Get a subset of properties from the error response which
        // shouldn't contain sensitive data and are therefore safe to log.
        // eslint-disable-next-line no-unsafe-optional-chaining
        const { data, status, statusText } = error?.response;
        const errorToLog = { data, status, statusText };

        logger?.warn(
            `The HTTP [${error?.config?.method}] request to URL [${
                error?.config?.url
            }] failed. Retry [${currentState?.retryNumber}] of [${configEntry?.retries}] will be performed in [${
                retryDelayMs / 1000
            }] seconds.`,
            { error: errorToLog }
        );

        await sleep(retryDelayMs);
        return axiosRef.request(error.config);
    }

    return null;
}

/**
 * Enables resilient HTTP functionality for the provided Axios instance,
 * based upon the provided config.
 * @param {AxiosInstance} axiosRef The axios instance to enable resilient HTTP for.
 * @param {ResilientHttpConfig} resilientHttpConfig The configuration to use.
 * @param {Logger} logger The optional logger to be used.
 */
export default function enableResilientHttp(
    axiosRef: AxiosInstance,
    resilientHttpConfig: ResilientHttpConfig,
    logger?: Logger
): void {
    const parsedConfig = getParsedResilientHttpConfig(resilientHttpConfig, logger);

    axiosRef.interceptors.response.use(null, async (error) => {
        let retryPromise;

        // Check whether there is a retry override which is applicable to the request and use that override's config.
        const urlHasRetryOverride = parsedConfig.overrides.some((override) => {
            if (!isConfigEntryApplicable(override, error)) {
                // Don't process this override any further if its config isn't a match for the response.
                return false;
            }

            // If we've got this far, the override config is a match so get the promise that will perform the retry.
            retryPromise = getRetryPromise(axiosRef, override, error, logger);

            return true;
        });

        // When there is no applicable override, use the default config when it's applicable.
        if (
            !urlHasRetryOverride &&
            parsedConfig.default &&
            isConfigEntryApplicable(parsedConfig.default, error)
        ) {
            retryPromise = getRetryPromise(axiosRef, parsedConfig.default, error, logger);
        }

        if (retryPromise) {
            const result = await retryPromise;
            if (result !== null) {
                return result;
            }
        }

        return Promise.reject(error);
    });
}
