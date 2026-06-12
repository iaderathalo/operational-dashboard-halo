import { Logger, SiemEventName } from '@mmctech-artifactory/polaris-logger';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { ApplicationComponent } from '@operational-dashboard/shared-api-model/constants/siem-logging';
import {
    CreateTaskRequest,
    UpdateTaskRequest,
    Task as TaskDto,
} from '@operational-dashboard/shared-api-model/model/tasks';

import { TaskRepository } from './task.repository';

/**
 * TasksService provides the business logic for the Tasks API
 * and persists any data to a Mongo datastore.
 */
@Injectable()
export default class TasksService {
    /**
     * @param {Logger} logger - An instance of the Logger class.
     * @param {TaskRepository} taskRepository - An instance of the TaskRepository class that is injected using the @Inject decorator.
     * This is used to interact with the task repository and perform CRUD operations. The string 'TaskRepository' is the token that will be used to look up the dependency in the providers array.
     */
    constructor(
        private logger: Logger,
        @Inject('TaskRepository') private taskRepository: TaskRepository
    ) {}

    /**
     * Creates a new task based upon the provided create task request.
     * @param {CreateTaskRequest} createTask The object representing the task to be created.
     * @returns {Promise<string>}  A promise containing a string representing the ID of the newly created task.
     */
    async create(createTask: CreateTaskRequest): Promise<string> {
        try {
            const savedTaskID = await this.taskRepository.create(createTask);

            this.logger.info(`[${savedTaskID}] task was created`);

            const taskIDAsStr = String(savedTaskID);
            return taskIDAsStr;
        } catch (error) {
            this.logger.error(`There was an error creating task: [${JSON.stringify(createTask)}]`, {
                error,
            });
            throw new Error('Unable to save the task to database');
        }
    }

    /**
     * Retrieves all tasks.
     * @returns {Promise<TaskDto[]>} A promise containing an array of all tasks.
     */
    async findAll(): Promise<TaskDto[]> {
        let dataModelTasks;

        try {
            dataModelTasks = await this.taskRepository.findAll();
        } catch (err) {
            this.logger.error('There was an error finding all tasks.', { error: err });

            throw err;
        }

        return dataModelTasks;
    }

    /**
     * Retrieves the task with the provided ID.
     * @param {string} id The ID of the task to find.
     * @returns {Promise<TaskDto>} A promise containing the retrieved task.
     */
    async findOne(id: string): Promise<TaskDto> {
        if (!id) {
            this.logger.siem(SiemEventName.INPUT_VALIDATION, {
                msg: 'Failed to find task. no id provided',
                context: { id },
                applicationComponent: ApplicationComponent.TASKS_SERVICE,
            });
            throw new BadRequestException(`Invalid ID of: [${id}] was provided.`);
        }

        let task;
        try {
            task = await this.taskRepository.findOne({ _id: id });
        } catch (error) {
            this.logger.error(`There was an error finding task with ID: [${id}].`, {
                error,
            });

            throw error;
        }

        if (!task) {
            throw new NotFoundException(`No task found for id [${id}]`);
        }

        return task;
    }

    /**
     * Updates the task with the provided ID to match the provided update task.
     * @param {string} id The ID of the task to update.
     * @param {UpdateTaskRequest} updateTask The updated version of the task.
     */
    async update(id: string, updateTask: UpdateTaskRequest): Promise<void> {
        if (id !== updateTask.id) {
            this.logger.siem(SiemEventName.INPUT_VALIDATION, {
                msg: 'Failed to update user. ID does not match the update task',
                context: { id, updateTask },
                applicationComponent: ApplicationComponent.TASKS_SERVICE,
            });
            throw new BadRequestException(
                `Provided task id [${id}] does not match id of submitted task object`
            );
        }

        // eslint-disable-next-line no-param-reassign
        delete updateTask.id;

        let updateResult;
        try {
            updateResult = await this.taskRepository.updateOne({ _id: id }, updateTask);
        } catch (err) {
            this.logger.error(
                `There was an error updating task: [${JSON.stringify(updateTask)}].`,
                { error: err }
            );

            throw err;
        }

        if (updateResult === 0) {
            throw new NotFoundException(`No task found for id [${id}]`);
        }
    }

    /**
     * Deletes the task with the provided ID.
     * @param {string} id The ID of the task to delete.
     */
    async remove(id: string): Promise<void> {
        let deleteResult;
        try {
            deleteResult = await this.taskRepository.deleteOne({ _id: id });
        } catch (err) {
            this.logger.error(`There was an error deleting task with ID: [${id}].`, { error: err });

            throw err;
        }

        if (!deleteResult) {
            throw new NotFoundException(`No task found for id [${id}]`);
        }
    }

    /**
     * Deletes all tasks.
     * @returns {Promise<number>} A promise which contains the number of tasks deleted.
     */
    async removeAll(): Promise<number> {
        try {
            const deleteResult = await this.taskRepository.deleteAll();

            return deleteResult;
        } catch (err) {
            this.logger.error('There was an error deleting all tasks.', { error: err });
            throw err;
        }
    }
}
