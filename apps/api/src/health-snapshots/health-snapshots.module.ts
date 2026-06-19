import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import InMemoryHealthSnapshotRepository from './in-memory/in-memory-health-snapshot.repository';
import MongoHealthSnapshotRepository from './mongo/mongo-health-snapshot.repository';

@Module({
    providers: [
        InMemoryHealthSnapshotRepository,
        MongoHealthSnapshotRepository,
        {
            provide: 'HealthSnapshotRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryHealthSnapshotRepository: InMemoryHealthSnapshotRepository,
                mongoHealthSnapshotRepository: MongoHealthSnapshotRepository
            ) => {
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl ? mongoHealthSnapshotRepository : inMemoryHealthSnapshotRepository;
            },
            inject: [
                ConfigService,
                InMemoryHealthSnapshotRepository,
                MongoHealthSnapshotRepository,
            ],
        },
    ],
    exports: ['HealthSnapshotRepository'],
})
export default class HealthSnapshotsModule {}
