import { Logger } from '@mmctech-artifactory/polaris-logger';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';

import {
    CreateTaskRequest,
    UpdateTaskRequest,
} from '@operational-dashboard/shared-api-model/model/tasks';

import TaskTestUtils from './TaskTestUtils';
import sampleTasks from './sampleTasks';
import TasksService from './tasks.service';

const newTaskMockId = '1234567890ABCDEFab000060';
class MockTaskModel {
    /**
     * Creates a new task object and assigns it an id.
     * @param {object} newTask - The task object to be created.
     * @returns {object} The created task object with an id.
     */
    static create(newTask) {
        return { newTask, id: newTaskMockId };
    }

    /**
     * Returns a promise that resolves to an array of sample tasks.
     * @returns {Promise} A promise that resolves to an array of sample tasks.
     */
    static findAll() {
        return Promise.resolve(sampleTasks);
    }

    /**
     * Returns a promise that resolves to a specific task in the sample tasks array.
     * @returns {Promise} A promise that resolves to a specific task in the sample tasks array.
     */
    static findOne() {
        return Promise.resolve(sampleTasks[1]);
    }

    /**
     * Returns a promise that resolves to an object indicating that one task has been deleted.
     * @returns {Promise} A promise that resolves to an object indicating that one task has been deleted.
     */
    static deleteOne() {
        return Promise.resolve({ n: 1, ok: 1, deletedCount: 1 });
    }

    /**
     * Returns a promise that resolves to an object indicating that one task has been updated.
     * @returns {Promise} A promise that resolves to an object indicating that one task has been updated.
     */
    static updateOne() {
        return Promise.resolve({ n: 1, nModified: 1, ok: 1 });
    }

    /**
     * Returns a promise that resolves to true indicating that all tasks have been deleted.
     * @returns {Promise} A promise that resolves to true indicating that all tasks have been deleted.
     */
    static deleteAll() {
        return Promise.resolve(true);
    }
}

describe('TasksService', () => {
    let service: TasksService;
    let mockLogger: MockProxy<Logger>;

    beforeEach(async () => {
        mockLogger = mock<Logger>();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TasksService,
                {
                    provide: 'TaskRepository',
                    useValue: MockTaskModel,
                },
                {
                    provide: Logger,
                    useValue: mockLogger,
                },
            ],
        }).compile();

        service = module.get<TasksService>(TasksService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return all tasks', async () => {
        const findSpy = jest.spyOn(MockTaskModel, 'findAll');
        findSpy.mockImplementationOnce(async () => sampleTasks);
        expect(await service.findAll()).toEqual(sampleTasks);
        expect(findSpy).toHaveBeenCalledWith();
        expect(findSpy).toHaveBeenCalledTimes(1);
    });

    it('should return the task with the specified ID', async () => {
        const findByIdSpy = jest.spyOn(MockTaskModel, 'findOne');
        expect(await service.findOne(sampleTasks[1].id)).toEqual(sampleTasks[1]);
        expect(findByIdSpy).toHaveBeenCalledWith({ _id: sampleTasks[1].id });
        expect(findByIdSpy).toHaveBeenCalledTimes(1);
    });

    it('should delete a task', async () => {
        const deleteOneSpy = jest.spyOn(MockTaskModel, 'deleteOne');
        await service.remove(sampleTasks[0].id);
        expect(deleteOneSpy).toHaveBeenCalledWith({ _id: sampleTasks[0].id });
        expect(deleteOneSpy).toHaveBeenCalledTimes(1);
    });

    it('should add a task', async () => {
        const id = '1234567890abcdefab000060';
        const saveSpy = jest.spyOn(MockTaskModel, 'create');
        const newTask = TaskTestUtils.mockTaskNoId(3) as CreateTaskRequest;
        saveSpy.mockReturnValueOnce(id as never);

        expect(await service.create(newTask)).toBe(newTaskMockId.toLowerCase());

        expect(saveSpy).toHaveBeenCalledWith(newTask);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('should update a task', () => {
        const updateOneSpy = jest.spyOn(MockTaskModel, 'updateOne');
        const updateMockId = '1234567890ABCDEFab000111';
        const updateTask: UpdateTaskRequest = {
            id: updateMockId,
            name: 'updated name',
            description: 'updated description',
            priority: 0,
        };

        service.update(updateMockId, updateTask);
        expect(updateOneSpy).toHaveBeenCalledWith({ _id: updateMockId }, updateTask);
        expect(updateOneSpy).toHaveBeenCalledTimes(1);
    });

    it('should remove all tasks', async () => {
        const deleteManySpy = jest.spyOn(MockTaskModel, 'deleteAll');
        expect(await service.removeAll()).toBe(true);

        expect(deleteManySpy).toHaveBeenCalledWith();
        expect(deleteManySpy).toHaveBeenCalledTimes(1);
    });

    it('should log an error when the model save throws an error', async () => {
        const saveSpy = jest.spyOn(MockTaskModel, 'create');
        saveSpy.mockImplementationOnce(() => {
            throw new Error('there was a save error');
        });

        const newTask = TaskTestUtils.mockTaskNoId(8) as CreateTaskRequest;

        await expect(service.create(newTask)).rejects.toThrow(
            new Error('Unable to save the task to database')
        );

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            `There was an error creating task: [${JSON.stringify(newTask)}]`,
            { error: new Error('there was a save error') }
        );
    });

    it('should log an error when the model findById throws an error', async () => {
        const findByIdSpy = jest.spyOn(MockTaskModel, 'findOne');
        findByIdSpy.mockRejectedValueOnce(new Error('there was a find by ID error'));

        await expect(service.findOne('1234567890ABCDEFab000444')).rejects.toThrow(
            new Error('there was a find by ID error')
        );

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            'There was an error finding task with ID: [1234567890ABCDEFab000444].',
            { error: new Error('there was a find by ID error') }
        );
    });

    it('should log an error when the model find throws an error', async () => {
        const findSpy = jest.spyOn(MockTaskModel, 'findAll');
        findSpy.mockRejectedValueOnce(new Error('there was a find error'));

        await expect(service.findAll()).rejects.toThrow(new Error('there was a find error'));

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith('There was an error finding all tasks.', {
            error: new Error('there was a find error'),
        });
    });

    it('should log an error when the model updateOne throws an error', async () => {
        const updateOneSpy = jest.spyOn(MockTaskModel, 'updateOne');
        updateOneSpy.mockRejectedValueOnce(new Error('there was an update error'));

        const updateMockId = '1234567890ABCDEFab000333';
        const updateTask: UpdateTaskRequest = {
            id: updateMockId,
            name: 'updated name 3',
            description: 'updated description 3',
            priority: 1,
        };
        await expect(service.update(updateMockId, updateTask)).rejects.toThrow(
            new Error('there was an update error')
        );

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            `There was an error updating task: [${JSON.stringify(updateTask)}].`,
            { error: new Error('there was an update error') }
        );
    });

    it('should log an error when the model deleteOne throws an error', async () => {
        const deleteOneSpy = jest.spyOn(MockTaskModel, 'deleteOne');
        deleteOneSpy.mockRejectedValueOnce(new Error('there was a delete one error'));

        await expect(service.remove('1234567890ABCDEFab000777')).rejects.toThrow(
            new Error('there was a delete one error')
        );

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
            'There was an error deleting task with ID: [1234567890ABCDEFab000777].',
            { error: new Error('there was a delete one error') }
        );
    });

    it('should log an error when the model deleteMany throws an error', async () => {
        const deleteManySpy = jest.spyOn(MockTaskModel, 'deleteAll');
        deleteManySpy.mockRejectedValueOnce(new Error('there was a delete many error'));

        await expect(service.removeAll()).rejects.toThrow(
            new Error('there was a delete many error')
        );

        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledWith('There was an error deleting all tasks.', {
            error: new Error('there was a delete many error'),
        });
    });

    it('should throw not found on update task with non-existent id', async () => {
        const updateOneSpy = jest.spyOn(MockTaskModel, 'updateOne');
        const updateMockId = '1234567890ABCDEFab000222';
        const updateTask: UpdateTaskRequest = {
            id: updateMockId,
            name: 'updated name 2',
            description: 'updated description 2',
            priority: 1,
        };
        updateOneSpy.mockRejectedValueOnce(
            new NotFoundException(`No task found for id [${updateMockId}]`)
        );
        await expect(service.update(updateMockId, updateTask)).rejects.toThrow(
            new NotFoundException(`No task found for id [${updateMockId}]`)
        );
    });

    it('should throw not found on findOne with non-existent task id', async () => {
        const findByIdSpy = jest.spyOn(MockTaskModel, 'findOne');
        findByIdSpy.mockImplementationOnce(async () => null);
        await expect(async () => {
            await service.findOne('asdfa');
        }).rejects.toThrow(new NotFoundException('No task found for id [asdfa]'));
    });

    it('should throw bad request on findOne with invalid id', async () => {
        await expect(async () => {
            await service.findOne('');
        }).rejects.toThrow(new BadRequestException('Invalid ID of: [] was provided.'));
    });

    it('should throw bad request on update task with different task ids', async () => {
        await expect(async () => {
            await service.update(sampleTasks[0].id, sampleTasks[1]);
        }).rejects.toThrow(
            new BadRequestException(
                `Provided task id [${sampleTasks[0].id}] does not match id of submitted task object`
            )
        );
    });

    it('should throw not found on delete task with non-existent task id', async () => {
        const deleteOneSpy = jest.spyOn(MockTaskModel, 'deleteOne');
        deleteOneSpy.mockRejectedValueOnce(
            new NotFoundException('No task found for id [invalid id]')
        );

        await expect(async () => {
            await service.remove('invalid id');
        }).rejects.toThrow(new NotFoundException('No task found for id [invalid id]'));
    });
});
