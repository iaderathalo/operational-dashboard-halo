import { loggerMiddleware, nestLoggerAdapter } from '@mmctech-artifactory/polaris-logger';
import * as PolarisLogger from '@mmctech-artifactory/polaris-logger';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { when } from 'jest-when';

import { APPLICATION_CODE } from '@app/config';

import AppModule from './app/app.module';
import FormattedExceptionFilter from './app/common/FormattedExceptionFilter';
import apiVersionHeader from './app/common/apiVersionHeader';
import cacheControlHeaders from './app/common/cacheControlHeaders';
import bootstrap, { apiSpecYamlFile, customOrigin, initializeLogger } from './server';

// Prevent the ConfigModule from trying to load from process.env.
jest.mock('@nestjs/config', () => ({ ConfigModule: { forRoot: jest.fn() } }));
jest.mock('@nestjs/core');
jest.mock('helmet');
jest.mock('./app/common/apiVersionHeader');
jest.mock('./app/common/cacheControlHeaders');
jest.mock('@mmctech-artifactory/polaris-logger');

const mockApiVersionHeader = apiVersionHeader as jest.MockedFunction<typeof apiVersionHeader>;

describe('initializeLogger', () => {
    it('should initialize the logger with the expected options', () => {
        const mockEnvBody = {
            LOG_LEVEL: 'debug',
            LOG_REQUEST_HEADERS: 'content-type,pragma,Etag ,Content-Encoding',
            LOG_RESPONSE_HEADERS: 'content-type,pragma,Etag,Content-Encoding',
            LOG_INCLUDE_BODIES: 'false',
            LOG_INCLUDE_TIMESTAMP: 'true',
        };

        const expectedLoggingOptions = {
            level: 'debug',
            requestHeaders: ['content-type', 'pragma', 'etag', 'content-encoding'],
            responseHeaders: ['content-type', 'pragma', 'etag', 'content-encoding'],
            pretty: false,
            includeBodies: false,
            timeStamp: true,
            applicationCode: APPLICATION_CODE,
        };

        initializeLogger(mockEnvBody);

        expect(PolarisLogger.initLogging).toHaveBeenCalledTimes(1);
        expect(PolarisLogger.initLogging).toHaveBeenCalledWith(expectedLoggingOptions);
    });
});

describe('bootstrap', () => {
    let app;
    afterEach(() => {
        if (app) app.close();
        jest.restoreAllMocks();
    });
    it('should start listening on the default port with expected configuration', async () => {
        // Mocking the NestFactory.create method, and functions called by the server.
        // This allows the test to verify that the server is being configured as
        // expected.
        const listen = jest.fn();
        const setGlobalPrefix = jest.fn();
        const useGlobalFilters = jest.fn();
        const use = jest.fn();
        const httpAdapterGet = jest.fn();
        const getHttpAdapter = jest.fn().mockReturnValue({
            get: httpAdapterGet,
        });
        const registerParserMiddleware = jest.fn();
        const getConfig = jest.fn();
        when(getConfig)
            .calledWith('BUILD_VERSION')
            .mockReturnValue('1.2.3')
            .calledWith('API_PORT')
            .mockReturnValue(1234);
        const get = jest.fn().mockReturnValueOnce({ get: getConfig });

        NestFactory.create = jest.fn().mockReturnValue(
            Promise.resolve({
                setGlobalPrefix,
                use,
                useGlobalFilters,
                listen,
                getHttpAdapter,
                registerParserMiddleware,
                get,
            })
        );

        const versionHeaderMiddleware = () => {};
        mockApiVersionHeader.mockReturnValue(versionHeaderMiddleware);

        // bootstrap the server with mocked Nest factory, and check that it is setup as expected.
        app = await bootstrap();

        // Check cors is enabled.
        expect(NestFactory.create).toHaveBeenCalledWith(AppModule, {
            cors: {
                origin: customOrigin,
                exposedHeaders: ['Location'],
                methods: ['GET', 'PUT', 'POST', 'DELETE'],
            },
            logger: nestLoggerAdapter,
        });
        expect(setGlobalPrefix).toHaveBeenCalledWith('/api/v1');

        // Check that middleware is configured as expected.
        expect(registerParserMiddleware).toHaveBeenCalledTimes(1);
        expect(use).toHaveBeenCalledWith(loggerMiddleware);
        expect(use).toHaveBeenCalledWith(helmet());
        expect(getConfig).toHaveBeenCalledWith('BUILD_VERSION');
        expect(mockApiVersionHeader).toHaveBeenCalledWith('1.2.3');
        expect(use).toHaveBeenCalledWith(versionHeaderMiddleware);
        expect(use).toHaveBeenCalledWith(cacheControlHeaders);

        // Check that the exception formatting is in place.
        expect(useGlobalFilters).toHaveBeenCalledWith(expect.any(FormattedExceptionFilter));

        // Check that the exception formatting is in place.
        expect(httpAdapterGet).toHaveBeenCalledWith('/api/openapi', expect.any(Function));
        expect(httpAdapterGet).toHaveBeenCalledWith('/api/openapi.yaml', expect.any(Function));

        // Mock a response object for the next tests
        const type = jest.fn();
        const send = jest.fn();
        const mockResponse = {
            type,
            send,
        };

        // This will just check that the setup for /opanApi results in "something" being sent.
        // This "something" is the generated swagger HTML.
        httpAdapterGet.mock.calls[0][1](null, mockResponse);
        expect(send.mock.calls[0][0]).toContain('<title>Swagger UI</title>');

        // Check that the "/openapi.yaml" file returns the expected response.
        type.mockReset();
        send.mockReset();
        httpAdapterGet.mock.calls[1][1](null, mockResponse);
        expect(type).toHaveBeenCalledWith('.yaml');
        expect(send).toHaveBeenCalledWith(apiSpecYamlFile);

        // Check that the app is listening on the expected port.
        expect(getConfig).toHaveBeenCalledWith('API_PORT');
        expect(listen).toHaveBeenCalledWith(1234);
    });
});

describe('customOrigin', () => {
    test('allows requests from localhost', () => {
        const origin = 'http://localhost:4200';
        const callback = jest.fn();
        customOrigin(origin, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('allows requests from localhost with a different port', () => {
        const origin = 'http://localhost:3000';
        const callback = jest.fn();
        customOrigin(origin, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('allows requests from subdomains of oss2.mrshmc.com', () => {
        const origin = 'http://subdomain.oss2.mrshmc.com';
        const callback = jest.fn();
        customOrigin(origin, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('allows requests from subdomains of oss2.mrshmc.com with a different path', () => {
        const origin = 'http://subdomain.oss2.mrshmc.com/tasks';
        const callback = jest.fn();
        customOrigin(origin, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });

    test('does not allow requests from other domains', () => {
        const origin = 'http://test.com';
        const callback = jest.fn();
        customOrigin(origin, callback);
        expect(callback).toHaveBeenCalledWith(new Error('Not allowed by CORS'));
    });

    test('handles missing origin header', () => {
        const origin = undefined;
        const callback = jest.fn();
        customOrigin(origin, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });
});
