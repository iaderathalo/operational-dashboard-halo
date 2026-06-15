import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { mock } from 'jest-mock-extended';
import * as tsm from 'ts-mockito';

import {
    CreateTaskRequest,
    GetTasksResponse,
    Task,
} from '@operational-dashboard/shared-api-model/model/tasks';

import TaskTestUtils from './TaskTestUtils';
import mockTaskId from './mockTaskId';
import sampleTasks from './sampleTasks';
import { Task as DataModelTask } from './schemas/task.schema';
import TasksController from './tasks.controller';
import TasksService from './tasks.service';

const mockedTasksService = tsm.mock(TasksService);
const mockedTasksServiceInstance = tsm.instance(mockedTasksService);

describe('With TasksController', () => {
    let controller: TasksController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [TasksController],
            providers: [
                {
                    provide: TasksService,
                    useValue: mockedTasksServiceInstance,
                },
            ],
        }).compile();

        controller = module.get<TasksController>(TasksController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('calls findAll', async () => {
        tsm.when(mockedTasksService.findAll()).thenReturn(Promise.resolve(sampleTasks));
        expect(await controller.findAll()).toEqual({
            tasks: sampleTasks,
        } as GetTasksResponse);
    });

    it('calls create', async () => {
        // Given
        const request = mock<Request>({ url: '/api/tasks' });
        const response = mock<Response>();

        const task = TaskTestUtils.mockTaskWithId(1) as CreateTaskRequest;

        const taskId = mockTaskId();
        tsm.when(mockedTasksService.create(task)).thenReturn(Promise.resolve(taskId));

        // When
        await controller.create(request, response, task);

        // Then
        tsm.verify(mockedTasksService.create(task)).once();
        expect(response.location).toHaveBeenCalledWith(`/api/tasks/${taskId}`);
        expect(response.send).toHaveBeenCalledTimes(1);
    });

    it('calls update', async () => {
        expect.assertions(1);
        const task = TaskTestUtils.mockTaskWithId(1);
        await controller.update(task.id, task);
        tsm.verify(mockedTasksService.update(task.id, task)).once();
        expect(true).toBe(true);
    });

    it('calls findOne', async () => {
        const task = TaskTestUtils.mockTaskWithId(1);
        tsm.when(mockedTasksService.findOne(task.id)).thenReturn(
            Promise.resolve(task as DataModelTask)
        );
        expect(await controller.findOne(task.id)).toEqual({ ...task } as Task);
    });

    it('calls remove by ID', async () => {
        expect.assertions(1);
        const taskId = mockTaskId();
        await controller.remove(taskId);
        tsm.verify(mockedTasksService.remove(taskId)).once();
        expect(true).toBe(true);
    });

    it('calls removeAll', async () => {
        expect.assertions(1);
        await controller.removeAll();
        tsm.verify(mockedTasksService.removeAll()).once();
        expect(true).toBe(true);
    });
});
