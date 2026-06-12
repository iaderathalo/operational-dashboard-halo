import fs from 'fs';
import { join } from 'path';

// Tracing import has to be set at the very top
// eslint-disable-next-line import/order
import initTracing from './trace';

import {
    initLogging,
    loggerMiddleware,
    nestLoggerAdapter,
    LoggingOptions,
} from '@mmctech-artifactory/polaris-logger';
import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestApplication, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import helmet from 'helmet';
import { load as yamlLoad } from 'js-yaml';
import swaggerUI from 'swagger-ui-express';

import { APPLICATION_CODE } from '@app/config';

import AppModule from './app/app.module';
import FormattedExceptionFilter from './app/common/FormattedExceptionFilter';
import apiVersionHeader from './app/common/apiVersionHeader';
import cacheControlHeaders from './app/common/cacheControlHeaders';

const globalPrefix = '/api/v1';
const apiSpecLocation = join(__dirname, 'assets', 'api', 'openapi.yaml');
export const apiSpecYamlFile = fs.readFileSync(apiSpecLocation);

/**
 * Nest's inbuilt swagger support expects to generate the OpenAPI document from
 * the code. This doesn't work for our "design first" approach to APIs. The following
 * function will expose the swagger UI using an openapi.yaml file.
 * @param {NestExpressApplication} app - Instance of NestExpressApplication
 */
function addSwaggerUI(app: NestExpressApplication) {
    const schema = yamlLoad(apiSpecYamlFile.toString());
    const httpAdapter = app.getHttpAdapter();
    const swaggerHtml = swaggerUI.generateHTML(schema, {});
    app.use('/api/openapi', swaggerUI.serveFiles(schema, {}));
    httpAdapter.get('/api/openapi', (_req: Request, res: Response) => res.send(swaggerHtml));
    httpAdapter.get('/api/openapi.yaml', (_req: Request, res: Response) => {
        res.type('.yaml');
        res.send(apiSpecYamlFile);
    });
}

export const customOrigin = (origin, callback) => {
    if (!origin) {
        callback(null, true);
        return;
    }
    const originHostName = new URL(origin).hostname;
    if (originHostName === 'localhost' || originHostName.endsWith('oss2.mrshmc.com')) {
        callback(null, true);
    } else {
        callback(new Error('Not allowed by CORS'));
    }
};

/**
 * Initializes the Polaris Logger by generating the  LoggingOptions based upon
 * the supplied environment variables.
 * @param {Record<string, string>} env The environment variables.
 */
export function initializeLogger(env: Record<string, string>) {
    /**
     * Converts a comma separated string to an array of strings.
     * @param {string} value - The comma separated string.
     * @returns {string[]} The parsed array of strings.
     */
    function convertStringToArray(value: string) {
        return value
            .toLowerCase()
            .split(',')
            .map((item) => item.trim()) // Remove whitespace.
            .filter(Boolean); // Remove empty strings.
    }

    const loggingOptions: Partial<LoggingOptions> = {
        level: env.LOG_LEVEL ?? 'info',
        pretty: env.LOG_PRETTY_FORMAT === 'true',
    };
    if (env.LOG_INCLUDE_TIMESTAMP !== undefined) {
        loggingOptions.timeStamp = env.LOG_INCLUDE_TIMESTAMP === 'true';
    }
    if (env.LOG_INCLUDE_BODIES !== undefined) {
        loggingOptions.includeBodies = env.LOG_INCLUDE_BODIES === 'true';
    }
    if (env.LOG_REQUEST_HEADERS !== undefined) {
        loggingOptions.requestHeaders = convertStringToArray(env.LOG_REQUEST_HEADERS);
    }
    if (env.LOG_RESPONSE_HEADERS !== undefined) {
        loggingOptions.responseHeaders = convertStringToArray(env.LOG_RESPONSE_HEADERS);
    }

    loggingOptions.applicationCode = APPLICATION_CODE;

    initLogging(loggingOptions);
}

/**
 * Bootstraps the Nest.js application by initializing the environment logging,
 * creating the Nest.js application, setting the global prefix, adding middleware,
 * adding global filters, and starting the Express server.
 */
export default async function bootstrap() {
    // Provide the Logger with configuration before starting the app bootstrap.
    initializeLogger(process.env);

    NestLogger.log('Initializing Nest Application');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        cors: {
            origin: customOrigin,
            exposedHeaders: ['Location'],
            methods: ['GET', 'PUT', 'POST', 'DELETE'],
        },
        logger: nestLoggerAdapter,
    });
    const configService = app.get(ConfigService);

    // Enable APM tracing

    initTracing.bind(configService)();

    NestLogger.log('Adding global prefix');
    app.setGlobalPrefix(globalPrefix);

    // Middleware - parser middleware would typically be registered during `app.listen` but is
    // instead registered before the logger middleware as body-parser is not compatible with
    // AsyncLocalStorage. <https://github.com/expressjs/body-parser/issues/422>
    NestLogger.log('Adding parser middleware');
    (<NestApplication>(<unknown>app)).registerParserMiddleware();
    NestLogger.log('Adding logger middleware');
    app.use(loggerMiddleware);
    NestLogger.log('Adding helmet middleware');
    app.use(
        helmet({
            contentSecurityPolicy: true,
        })
    );

    const useFrameguardMiddleware = configService.get<string>('USE_FRAMEGUARD_MIDDLEWARE');
    if (useFrameguardMiddleware) {
        app.use(helmet.frameguard({ action: 'sameorigin' }));
    }

    const useHstsMiddleware = configService.get<string>('USE_HSTS_MIDDLEWARE');
    if (useHstsMiddleware) {
        app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
    }

    NestLogger.log('Adding API versioning');
    app.use(apiVersionHeader(configService.get<string>('BUILD_VERSION')));
    NestLogger.log('Adding cache control headers');
    app.use(cacheControlHeaders);

    // Exception handling
    NestLogger.log('Adding global filters');
    app.useGlobalFilters(new FormattedExceptionFilter(configService));

    NestLogger.log('Adding swagger UI');
    addSwaggerUI(app);

    NestLogger.log('Starting Express server listening');
    // If port doesn't exist in the config service use default
    const port = configService.get<number>('API_PORT') || 8080;
    await app.listen(port);

    NestLogger.log(`Listening at http://localhost:${port}${globalPrefix}`);
}
