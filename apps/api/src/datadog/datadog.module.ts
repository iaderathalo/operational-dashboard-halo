import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ResilientHttpModule } from '@operational-dashboard/shared-nestjs-utils';

import { DatadogClient } from './datadog-client';
import DatadogSyncService from './datadog-sync.service';
import InternalSyncController from './internal-sync.controller';
import InternalSyncGuard from './internal-sync.guard';
import MockDatadogClient from './mock-datadog-client';
import RealDatadogClient from './real-datadog-client';
import ApplicationsModule from '../applications/applications.module';
import HealthSnapshotsModule from '../health-snapshots/health-snapshots.module';

@Module({
    imports: [
        ResilientHttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => {
                const site = configService.get<string>('DATADOG_SITE') || 'datadoghq.com';
                const baseURL =
                    configService.get<string>('DATADOG_BASE_URL') || `https://api.${site}`;
                return {
                    axiosConfig: {
                        baseURL,
                        timeout: 10000,
                        headers: {
                            'DD-API-KEY': configService.get<string>('DATADOG_API_KEY') || '',
                            'DD-APPLICATION-KEY':
                                configService.get<string>('DATADOG_APP_KEY') || '',
                        },
                    },
                    // Use the library's built-in retry defaults (ResilientHttpConfig is { default?, overrides? }).
                    resilientHttpConfig: {},
                };
            },
            inject: [ConfigService],
        }),
        ApplicationsModule,
        HealthSnapshotsModule,
    ],
    controllers: [InternalSyncController],
    providers: [
        InternalSyncGuard,
        DatadogSyncService,
        MockDatadogClient,
        RealDatadogClient,
        {
            // Real when a Datadog API key is configured, mock otherwise — same toggle
            // convention as the Mongo/in-memory repositories.
            provide: 'DatadogClient',
            useFactory: (
                configService: ConfigService,
                real: RealDatadogClient,
                mock: MockDatadogClient
            ): DatadogClient => (configService.get<string>('DATADOG_API_KEY') ? real : mock),
            inject: [ConfigService, RealDatadogClient, MockDatadogClient],
        },
    ],
    exports: ['DatadogClient', DatadogSyncService],
})
export default class DatadogModule {}
