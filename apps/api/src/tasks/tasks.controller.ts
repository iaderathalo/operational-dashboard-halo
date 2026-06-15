import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseInterceptors,
    ClassSerializerInterceptor,
    HttpCode,
    Res,
    Req,
} from '@nestjs/common';
import { Request, Response } from 'express';

import {
    CreateTaskRequest,
    DeleteTasksResponse,
    GetTasksResponse,
    Task,
    UpdateTaskRequest,
} from '@operational-dashboard/shared-api-model/model/tasks';

import TasksService from './tasks.service';

/**
 * The TasksController maps HTTP requests to the TasksServices. It takes care of
 * mechanics related to REST, such as returning the correct HTTP status code.
 *
 * Unless otherwise stated HTTP response codes on successful completion of calls
 * are set to 200.
 */
@Controller('/tasks')
@UseInterceptors(ClassSerializerInterceptor)
export default class TasksController {
    /**
     * @param {object} tasksService - task service dependency used to handle task operations
     */
    constructor(private readonly tasksService: TasksService) {}

    /**
     * Creates a new task. The "Location" response header will be set to include the
     * ID of the newly created task.
     *
     * Nest ensures that a HTTP response status code of 201 is set when this method
     * completes successfully.
     * @param {object} request - Express request object injected by Nest at runtime
     * @param {object} response - Express response object injected by Nest at runtime
     * @param {object} createTaskDto - values for a new task as defined by the task creation schema
     * @returns {Promise<void>} resolves when the task is created and the response is sent
     */
    @Post()
    async create(
        @Req() request: Request,
        @Res() response: Response,
        @Body() createTaskDto: CreateTaskRequest
    ): Promise<void> {
        const createdTaskId = await this.tasksService.create(createTaskDto);
        response.location(`${request.url}/${createdTaskId}`);
        response.send();
    }

    /**
     * Returns all the tasks for the user. This allows the user to browse all tasks in a UI.
     * @returns {Promise<object>} response object containing the array of tasks
     */
    @Get()
    async findAll(): Promise<GetTasksResponse> {
        const tasks = await this.tasksService.findAll();
        const result = {
            tasks,
        };

        return result;
    }

    /**
     * Returns the specific details of a task for the user.
     * @param {string} id - identifier of the task
     * @returns {Promise<object>} details of the identified task
     * @throws NotFoundException if the task ID is not found
     */
    @Get(':id')
    async findOne(@Param('id') id: string): Promise<Task> {
        const task = await this.tasksService.findOne(id);

        return {
            ...task,
        };
    }

    /**
     * Updates a specific task. The ID within the task must be the same as that provided as a path parameter.
     *
     * Throws a NotFoundException if the task ID is not found.
     *
     * Sets a HTTP response status code of 204 when this method completes successfully.
     * @param {string} id - identifier of the task to update
     * @param {object} updateTaskDto - updated task payload
     * @returns {Promise<void>} resolves when the task update completes
     */
    @Put(':id')
    @HttpCode(204)
    async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskRequest): Promise<void> {
        await this.tasksService.update(id, updateTaskDto);
    }

    /**
     * Deletes a specific task.
     *
     * Sets a HTTP response status code of 204 when this method completes successfully.
     * @param {string} id - ID of the specific task that has to be deleted.
     * @throws NotFoundException if the task ID is not found
     */
    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string): Promise<void> {
        await this.tasksService.remove(id);
    }

    /**
     * Deletes all the tasks for the user.
     *
     * Sets a HTTP response status code of 204 when this method completes successfully.
     * @returns {Promise<object>} response containing the number of deleted tasks
     */
    @Delete()
    async removeAll(): Promise<DeleteTasksResponse> {
        const numTasksDeleted = await this.tasksService.removeAll();
        return {
            numTasksDeleted,
        };
    }
}
