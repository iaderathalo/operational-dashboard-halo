/* eslint-disable import/first */
/* eslint-disable jsdoc/check-tag-names */
/**
 * Do not remove the below statement. This was added to resolve a CORS issue:
 * https://github.com/axios/axios/issues/1754
 * @jest-environment node
 */

// Mock the node:timers/promises module
jest.mock('node:timers/promises', () => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setTimeout: jest.fn((delay: number) => Promise.resolve()),
}));

import axios, { AxiosError, AxiosInstance, Method } from 'axios';

// eslint-disable-next-line import/order
import * as timersPromises from 'node:timers/promises';

import ResilientHttpConfigDefault from './ResilientHttpConfigDefault';
import ResilientHttpConfigOverride from './ResilientHttpConfigOverride';
import enableResilientHttp, {
    calculateRetryDelay,
    getDefaultResilientHttpConfig,
    getParsedResilientHttpConfig,
    isConfigEntryApplicable,
} from './resilient-http';

const mockSetTimeout = timersPromises.setTimeout as jest.Mock;

// require is necessary due to ESModuleInterop issues which weren't resolved
// by simply amending the tsconfig.spec.json.

const nock = require('nock');

test('library default config is as expected', () => {
    const defaultConfig = getDefaultResilientHttpConfig();
    expect(defaultConfig).toEqual({
        default: {
            methods: ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'],
            retries: 3,
            retryDelayMs: 1000,
            responseStatusCodes: [401, 403, 404, 500],
            exponent: 1,
        },
    });
});

describe('getParsedResilientHttpConfig', () => {
    it('returns the library default config when an empty config is supplied', () => {
        const libraryDefaultConfig = getDefaultResilientHttpConfig();
        const parsedConfig = getParsedResilientHttpConfig({});
        expect(parsedConfig).toEqual({ default: libraryDefaultConfig.default, overrides: [] });
    });

    it('returns the supplied config when it contains a valid default config', () => {
        const suppliedConfig = {
            default: {
                methods: ['GET'],
                retries: 2,
                retryDelayMs: 500,
                responseStatusCodes: [401, 403, 404, 500],
                exponent: 1,
            },
        };
        const parsedConfig = getParsedResilientHttpConfig(suppliedConfig);
        expect(parsedConfig).toEqual({ default: suppliedConfig.default, overrides: [] });
    });

    it('returns the supplied overrides and library defaults when the supplied config has no defaults', () => {
        const suppliedConfig = {
            overrides: [
                {
                    urlRegexes: [/api\.github\.com/],
                    methods: ['GET'],
                    retries: 2,
                    retryDelayMs: 500,
                    responseStatusCodes: [401, 403, 404, 500],
                    exponent: 1,
                },
                {
                    urlRegexes: [/api\.ado\.com/],
                    methods: ['POST', 'PUT'],
                    retries: 4,
                    retryDelayMs: 2000,
                    responseStatusCodes: [500],
                    exponent: 2,
                },
            ],
        };

        const libraryDefaultConfig = getDefaultResilientHttpConfig();
        const parsedConfig = getParsedResilientHttpConfig(suppliedConfig);
        expect(parsedConfig).toEqual({
            default: libraryDefaultConfig.default,
            overrides: suppliedConfig.overrides,
        });
    });

    it('returns the supplied overrides and defaults when the supplied config has both overrides and defaults specified', () => {
        const suppliedConfig = {
            default: {
                methods: ['GET', 'PUT'],
                retries: 2,
                retryDelayMs: 1500,
                responseStatusCodes: [401, 403, 404, 500],
                exponent: 1,
            },
            overrides: [
                {
                    urlRegexes: [/api\.github\.com/],
                    methods: ['GET'],
                    retries: 2,
                    retryDelayMs: 500,
                    responseStatusCodes: [401, 403, 404, 500],
                    exponent: 1,
                },
                {
                    urlRegexes: [/api\.ado\.com/],
                    methods: ['POST', 'PUT'],
                    retries: 4,
                    retryDelayMs: 2000,
                    responseStatusCodes: [500],
                    exponent: 2,
                },
            ],
        };

        const parsedConfig = getParsedResilientHttpConfig(suppliedConfig);
        expect(parsedConfig).toEqual(suppliedConfig);
    });
});

describe('calculateRetryDelay', () => {
    it('returns the initialInterval for all retries when the exponent = 0', () => {
        const initialInterval = 1000;
        const exponent = 0;
        const retryDelay = calculateRetryDelay(exponent, 1, initialInterval);
        expect(retryDelay).toEqual(initialInterval);
    });

    it('returns the initialInterval for all retries when the exponent = 1', () => {
        const initialInterval = 1000;
        const exponent = 1;

        const retry1Delay = calculateRetryDelay(exponent, 1, initialInterval);
        const retry2Delay = calculateRetryDelay(exponent, 2, initialInterval);
        const retry3Delay = calculateRetryDelay(exponent, 3, initialInterval);

        expect(retry1Delay).toBe(initialInterval);
        expect(retry2Delay).toBe(initialInterval);
        expect(retry3Delay).toBe(initialInterval);
    });

    it('returns an exponentially increasing delay (starting at the initial interval) when the exponent value is > 1', () => {
        const initialInterval = 1000;
        const exponent = 2;

        const retry1Delay = calculateRetryDelay(exponent, 1, initialInterval);
        const retry2Delay = calculateRetryDelay(exponent, 2, initialInterval);
        const retry3Delay = calculateRetryDelay(exponent, 3, initialInterval);

        expect(retry1Delay).toBe(1000);
        expect(retry2Delay).toBe(2000);
        expect(retry3Delay).toBe(4000);
    });
});

describe('isConfigEntryApplicable', () => {
    const testUrl = 'https://myTestUrl1.com';
    let config;
    let error: AxiosError;

    beforeEach(() => {
        config = { url: testUrl, method: 'PATCH' as Method };
        error = {
            name: 'Test Axios Error Name',
            message: 'Test Axios Error Message',
            config,
            response: { status: 500, data: '', statusText: '', headers: [] as never, config },
            isAxiosError: true,
            toJSON: () => ({}),
        };
    });

    it('should return true when the entry is a ResilientHttpConfigDefault and the method and status code match', async () => {
        const entry: ResilientHttpConfigDefault = {
            methods: ['PATCH', 'POST'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(true);
    });
    it('should return false when the entry is a ResilientHttpConfigDefault and the method does not match', async () => {
        const entry: ResilientHttpConfigDefault = {
            methods: ['POST'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(false);
    });
    it('should return false when the entry is a ResilientHttpConfigDefault and the response code does not match', async () => {
        const entry: ResilientHttpConfigDefault = {
            methods: ['POST'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [400],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(false);
    });
    it('should return true when any of the ResilientHttpConfigOverride url regexes match', async () => {
        const entry: ResilientHttpConfigOverride = {
            urlRegexes: [/thisregexwillnotmatch/, /https.*/],
            methods: ['PATCH', 'POST'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(true);
    });
    it('should handle string regexes', async () => {
        const entry: ResilientHttpConfigOverride = {
            urlRegexes: ['thisregexwillnotmatch', 'https.*'],
            methods: ['PATCH', 'POST'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(true);
    });
    it('should handle a mixture of string and RegExp regexes', async () => {
        const entry: ResilientHttpConfigOverride = {
            urlRegexes: ['thisregexwillnotmatch', /https.*/],
            methods: ['PATCH', 'POST'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(true);
    });
    it('should handle lowercase methods', async () => {
        const entry: ResilientHttpConfigOverride = {
            urlRegexes: [/https.*/],
            methods: ['patch', 'post'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(true);
    });
    it('should handle a mixture of lower and uppercase methods', async () => {
        const entry: ResilientHttpConfigOverride = {
            urlRegexes: [/https.*/],
            methods: ['PATCH', 'post'],
            retries: 2,
            retryDelayMs: 1000,
            responseStatusCodes: [500],
            exponent: 1,
        };

        const result = isConfigEntryApplicable(entry, error);

        expect(result).toBe(true);
    });
});

describe('enableResilientHttp', () => {
    let mockBaseUrl;
    let baseResilientHttpConfig;
    let axiosRef: AxiosInstance;
    beforeEach(() => {
        axiosRef = axios.create();
    });

    afterEach(() => {
        // Ensures the setTimeout spy is reset between tests.
        jest.clearAllMocks();
    });

    it('should add a response interceptor to the axios instance', () => {
        const interceptorSpy = jest.spyOn(axiosRef.interceptors.response, 'use');
        enableResilientHttp(axiosRef, baseResilientHttpConfig);
        expect(interceptorSpy).toHaveBeenCalledTimes(1);
    });

    describe('when the config only has a default, with no overrides', () => {
        mockBaseUrl = 'https://api.default-testing.com';

        beforeEach(() => {
            baseResilientHttpConfig = {
                default: {
                    methods: ['DELETE', 'GET', 'PUT'],
                    retries: 2,
                    retryDelayMs: 125,
                    responseStatusCodes: [401, 404, 500],
                    exponent: 1,
                },
            };
        });

        it('does not retry when the HTTP method is not in the defaults', async () => {
            const resilientHttpConfig = { default: baseResilientHttpConfig.default };
            // Mock the Node HTTP layer to return a 500 error for the given URL.
            // The response of this will be made available to the interceptor.
            nock(mockBaseUrl).patch('/default-test').times(1).reply(500);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                // Make a GET request which has been mocked to return 500.
                await axiosRef.patch(`${mockBaseUrl}/default-test`);
            } catch (err) {
                responseError = err;
            }

            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(500);
            expect(axiosRequestSpy).toHaveBeenCalledTimes(0);
        });
        it('does not retry when the HTTP status code is not in the defaults', async () => {
            const resilientHttpConfig = { default: baseResilientHttpConfig.default };
            nock(mockBaseUrl).get('/default-test').times(1).reply(403);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.get(`${mockBaseUrl}/default-test`);
            } catch (err) {
                responseError = err;
            }

            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(403);
            expect(axiosRequestSpy).toHaveBeenCalledTimes(0);
        });
        it('does not retry on 2xx codes, even if it is in the defaults', async () => {
            const resilientHttpConfig = {
                default: { ...baseResilientHttpConfig.default, ...{ responseStatusCodes: [200] } },
            };
            nock(mockBaseUrl).get('/default-test').times(1).reply(200);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            const responseSuccess = await axiosRef.get(`${mockBaseUrl}/default-test`);

            expect(responseSuccess).toBeDefined();
            expect(responseSuccess.status).toBe(200);
            expect(axiosRequestSpy).toHaveBeenCalledTimes(0);
        });

        it('does not retry when the default number of retries is 0', async () => {
            const resilientHttpConfig = {
                default: { ...baseResilientHttpConfig.default, retries: 0 },
            };
            nock(mockBaseUrl).get('/default-test').times(1).reply(404);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.get(`${mockBaseUrl}/default-test`);
            } catch (err) {
                responseError = err;
            }

            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(404);
            expect(axiosRequestSpy).toHaveBeenCalledTimes(0);
        });

        it('does not retry when the default number of retries is < 0', async () => {
            const resilientHttpConfig = {
                default: { ...baseResilientHttpConfig.default, retries: -1 },
            };
            nock(mockBaseUrl).get('/default-test').times(1).reply(404);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.get(`${mockBaseUrl}/default-test`);
            } catch (err) {
                responseError = err;
            }

            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(404);
            expect(axiosRequestSpy).toHaveBeenCalledTimes(0);
        });

        it('only retries the number of times specified in the default, using the retryDelayMs', async () => {
            const resilientHttpConfig = {
                default: baseResilientHttpConfig.default,
            };
            nock(mockBaseUrl)
                .get('/default-test')
                .times(1 + resilientHttpConfig.default.retries)
                .reply(404);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.get(`${mockBaseUrl}/default-test`);
            } catch (err) {
                responseError = err;
            }

            // Verify Axios returned an HTTP error.
            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(404);

            // Verify the correct number of Axios retry requests was made.
            expect(axiosRequestSpy).toHaveBeenCalledTimes(resilientHttpConfig.default.retries);

            // Verify the delay between retries was the same for both retries.
            expect(mockSetTimeout).toHaveBeenCalledTimes(resilientHttpConfig.default.retries);
            expect(mockSetTimeout.mock.calls[0][0]).toBe(resilientHttpConfig.default.retryDelayMs);
            expect(mockSetTimeout.mock.calls[1][0]).toBe(resilientHttpConfig.default.retryDelayMs);
        });

        it('retries with exponential back-off when the default exponent is > 1', async () => {
            const resilientHttpConfig = {
                default: { ...baseResilientHttpConfig.default, ...{ retries: 3, exponent: 2 } },
            };

            nock(mockBaseUrl)
                .get('/default-test')
                .times(1 + resilientHttpConfig.default.retries)
                .reply(500);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.get(`${mockBaseUrl}/default-test`);
            } catch (err) {
                responseError = err;
            }

            // Verify Axios returned an HTTP error.
            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(500);

            // Verify the correct number of Axios retry requests was made.
            expect(axiosRequestSpy).toHaveBeenCalledTimes(resilientHttpConfig.default.retries);

            // Verify the delay between retries was different between each try and increased
            // according to the exponent.
            expect(mockSetTimeout).toHaveBeenCalledTimes(resilientHttpConfig.default.retries);
            expect(mockSetTimeout.mock.calls[0][0]).toBe(125);
            expect(mockSetTimeout.mock.calls[1][0]).toBe(250);
            expect(mockSetTimeout.mock.calls[2][0]).toBe(500);
        });

        it('should return without error when the retry succeeds', async () => {
            const resilientHttpConfig = {
                default: baseResilientHttpConfig.default,
            };
            nock(mockBaseUrl)
                .get('/default-test')
                .times(2)
                .reply(404)
                .get('/default-test')
                .times(1)
                .reply(200);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            const responseSuccess = await axiosRef.get(`${mockBaseUrl}/default-test`);

            // Verify Axios returned without error.
            expect(responseSuccess).toBeDefined();
            expect(responseSuccess.status).toBe(200);

            // Verify the correct number of Axios retry requests was made.
            // The first request will return 404, the first retry will return 404
            // and the second retry will return 200.
            expect(axiosRequestSpy).toHaveBeenCalledTimes(2);
            expect(mockSetTimeout).toHaveBeenCalledTimes(2);
        });
    });

    describe('when the config has overrides and a default', () => {
        mockBaseUrl = 'https://api.override-testing.com';

        beforeEach(() => {
            baseResilientHttpConfig = {
                default: {
                    methods: ['DELETE', 'GET', 'PUT'],
                    retries: 1,
                    retryDelayMs: 100,
                    responseStatusCodes: [401, 404, 500],
                    exponent: 1,
                },
                overrides: [
                    {
                        urlRegexes: [/api\.override-testing\.com/],
                        methods: ['GET'],
                        retries: 2,
                        retryDelayMs: 200,
                        responseStatusCodes: [401, 403, 404, 500],
                        exponent: 1,
                    },
                    {
                        urlRegexes: [/api\.ado\.com/],
                        methods: ['POST', 'PUT'],
                        retries: 4,
                        retryDelayMs: 250,
                        responseStatusCodes: [500],
                        exponent: 2,
                    },
                ],
            };
        });

        it('should use the first override found, even when multiple would match', async () => {
            const resilientHttpConfig = {
                ...baseResilientHttpConfig,
            };
            resilientHttpConfig.overrides.push({
                urlRegexes: ['[^\n]*'],
                methods: ['GET'],
                retries: 3,
                retryDelayMs: 300,
                responseStatusCodes: [401, 403, 404, 500],
                exponent: 1,
            });

            nock(mockBaseUrl).get('/override-test').times(3).reply(404);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.get(`${mockBaseUrl}/override-test`);
            } catch (err) {
                responseError = err;
            }

            // Verify Axios returned an HTTP error.
            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(404);

            // Verify the correct number of Axios retry requests was made.
            expect(axiosRequestSpy).toHaveBeenCalledTimes(2);

            // Verify the delay between retries was the same for both retries.
            expect(mockSetTimeout).toHaveBeenCalledTimes(2);
            expect(mockSetTimeout.mock.calls[0][0]).toBe(200);
            expect(mockSetTimeout.mock.calls[1][0]).toBe(200);
        });

        it('should return without error when the retry succeeds', async () => {
            const resilientHttpConfig = {
                ...baseResilientHttpConfig,
            };
            nock(mockBaseUrl)
                .get('/override-test')
                .times(1)
                .reply(500)
                .get('/override-test')
                .times(1)
                .reply(204);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            const responseSuccess = await axiosRef.get(`${mockBaseUrl}/override-test`);

            // Verify Axios returned without error.
            expect(responseSuccess).toBeDefined();
            expect(responseSuccess.status).toBe(204);

            // Verify the correct number of Axios retry requests was made.
            // The first request will return 500, the first retry will return 204
            expect(axiosRequestSpy).toHaveBeenCalledTimes(1);
            expect(mockSetTimeout).toHaveBeenCalledTimes(1);
        });

        it('should use the default config when no override matches', async () => {
            const resilientHttpConfig = {
                ...baseResilientHttpConfig,
            };

            nock(mockBaseUrl).delete('/override-test').times(2).reply(401);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.delete(`${mockBaseUrl}/override-test`);
            } catch (err) {
                responseError = err;
            }

            // Verify Axios returned an HTTP error.
            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(401);

            // Verify the correct number of Axios retry requests was made.
            expect(axiosRequestSpy).toHaveBeenCalledTimes(1);
            expect(mockSetTimeout).toHaveBeenCalledTimes(1);
        });

        it('should not reset the number of retries when the error code changes between retry attempts', async () => {
            const resilientHttpConfig = {
                ...baseResilientHttpConfig,
            };
            resilientHttpConfig.overrides.push({
                urlRegexes: [/api\.override-testing\.com/, /api\.something-else\.com/],
                methods: ['PUT'],
                retries: 2,
                retryDelayMs: 50,
                responseStatusCodes: [404, 401],
                exponent: 3,
            });

            nock(mockBaseUrl)
                .put('/override-test')
                .times(1)
                .reply(404)
                .put('/override-test')
                .times(1)
                .reply(404)
                .put('/override-test')
                .times(1)
                .reply(401);

            enableResilientHttp(axiosRef, resilientHttpConfig);

            const axiosRequestSpy = jest.spyOn(axiosRef, 'request');

            let responseError;
            try {
                await axiosRef.put(`${mockBaseUrl}/override-test`);
            } catch (err) {
                responseError = err;
            }

            // Verify Axios returned an HTTP error.
            expect(responseError).toBeDefined();
            expect(responseError.response.status).toBe(401); // Axios only gets the last status code.

            // Verify the correct number of Axios retry requests was made.
            expect(axiosRequestSpy).toHaveBeenCalledTimes(2);

            // Verify the delay between increased according to the exponent.
            expect(mockSetTimeout).toHaveBeenCalledTimes(2);
            expect(mockSetTimeout.mock.calls[0][0]).toBe(50);
            expect(mockSetTimeout.mock.calls[1][0]).toBe(150);
        });
    });
});
