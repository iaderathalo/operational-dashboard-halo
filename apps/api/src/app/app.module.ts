import { LoggerModule } from '@mmctech-artifactory/polaris-logger';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import Joi from 'joi';

import AppController from './app.controller';
import AppService from './app.service';
import ApplicationsModule from '../applications/applications.module';
import DashboardModule from '../dashboard/dashboard.module';
import DatadogModule from '../datadog/datadog.module';
import HealthModule from '../health/health.module';
import IncidentsModule from '../incidents/incidents.module';
import TasksModule from '../tasks/tasks.module';
import TeamsModule from '../teams/teams.module';
import OktaGuard from './common/auth-guards/oktaGuard.service';

export const configSchema = Joi.object({
    API_MONGODB_API_DB_URL: Joi.string(),
    API_MONGODB_DB_URL: Joi.string(),
    USE_REAL_DATA: Joi.string().default('false'),
    API_MONGO_PW: Joi.string(),
    API_MSSQL_PW: Joi.string(),
    API_MSSQL_DB_URL: Joi.string(),
    BUILD_VERSION: Joi.string().default('0.0.1'),
    PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY: Joi.string(),
    PORT: Joi.number().integer().default(8080),
    APIGEE_ORGANIZATION: Joi.string().required(),
    APIGEE_CLIENT_ID: Joi.string().required(),
    DATADOG_SITE: Joi.string(),
    DATADOG_BASE_URL: Joi.string(),
    DATADOG_API_KEY: Joi.string(),
    DATADOG_APP_KEY: Joi.string(),
    INTERNAL_SYNC_TOKEN: Joi.string(),
    PORTFOLIO_OPCO_ALLOWLIST: Joi.string(),
});

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: configSchema,
        }),
        LoggerModule,
        ApplicationsModule,
        DashboardModule,
        IncidentsModule,
        TasksModule,
        TeamsModule,
        HealthModule,
        DatadogModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_GUARD,
            useClass: OktaGuard,
        },
    ],
})
export default class AppModule {}
