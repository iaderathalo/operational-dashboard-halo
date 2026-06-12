import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import InMemoryTeamRepository from './in-memory/in-memory-team.repository';
import MongoTeamRepository from './mongo/mongo-team.repository';
import TeamsController from './teams.controller';
import TeamsService from './teams.service';

@Module({
    controllers: [TeamsController],
    providers: [
        TeamsService,
        InMemoryTeamRepository,
        MongoTeamRepository,
        {
            provide: 'TeamRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryTeamRepository: InMemoryTeamRepository,
                mongoTeamRepository: MongoTeamRepository
            ) => {
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl ? mongoTeamRepository : inMemoryTeamRepository;
            },
            inject: [ConfigService, InMemoryTeamRepository, MongoTeamRepository],
        },
    ],
    exports: [TeamsService],
})
export default class TeamsModule {}
