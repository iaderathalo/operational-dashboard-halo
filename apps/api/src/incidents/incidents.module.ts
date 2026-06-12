import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import InMemoryIncidentRepository from './in-memory/in-memory-incident.repository';
import IncidentsController from './incidents.controller';
import IncidentsService from './incidents.service';
import MongoIncidentRepository from './mongo/mongo-incident.repository';

@Module({
    controllers: [IncidentsController],
    providers: [
        IncidentsService,
        InMemoryIncidentRepository,
        MongoIncidentRepository,
        {
            provide: 'IncidentRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryIncidentRepository: InMemoryIncidentRepository,
                mongoIncidentRepository: MongoIncidentRepository
            ) => {
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl ? mongoIncidentRepository : inMemoryIncidentRepository;
            },
            inject: [ConfigService, InMemoryIncidentRepository, MongoIncidentRepository],
        },
    ],
    exports: [IncidentsService],
})
export default class IncidentsModule {}
