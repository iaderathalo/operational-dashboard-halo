import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import ApplicationsController from './applications.controller';
import ApplicationsService from './applications.service';
import InMemoryApplicationRepository from './in-memory/in-memory-application.repository';
import MongoApplicationRepository from './mongo/mongo-application.repository';

@Module({
    controllers: [ApplicationsController],
    providers: [
        ApplicationsService,
        InMemoryApplicationRepository,
        MongoApplicationRepository,
        {
            provide: 'ApplicationRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryApplicationRepository: InMemoryApplicationRepository,
                mongoApplicationRepository: MongoApplicationRepository
            ) => {
                const useRealData = configService.get<string>('USE_REAL_DATA') === 'true';
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl && useRealData
                    ? mongoApplicationRepository
                    : inMemoryApplicationRepository;
            },
            inject: [ConfigService, InMemoryApplicationRepository, MongoApplicationRepository],
        },
    ],
    exports: [ApplicationsService],
})
export default class ApplicationsModule {}
