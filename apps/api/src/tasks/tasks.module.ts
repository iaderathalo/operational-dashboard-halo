import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import InMemoryTaskRepository from './in-memory/in-memory-task.repository';
import MongoTaskRepository from './mongo/mongo-task.repository';
import TasksController from './tasks.controller';
import TasksService from './tasks.service';

@Module({
    controllers: [TasksController],
    providers: [
        TasksService,
        InMemoryTaskRepository,
        MongoTaskRepository,
        {
            provide: 'TaskRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryTaskRepository: InMemoryTaskRepository,
                mongoTaskRepository: MongoTaskRepository
            ) => {
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl ? mongoTaskRepository : inMemoryTaskRepository;
            },
            inject: [ConfigService, InMemoryTaskRepository, MongoTaskRepository],
        },
    ],
    exports: [TasksService],
})
export default class TasksModule {}
