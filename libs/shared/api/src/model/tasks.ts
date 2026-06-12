/**
 * Make the model interfaces available from a single module.
 */
import CreateTaskRequest from './tasks/CreateTaskRequest';
import DeleteTasksResponse from './tasks/DeleteTasksResponse';
import GetTasksResponse from './tasks/GetTasksResponse';
import Task from './tasks/Task';
import TaskBase from './tasks/TaskBase';
import UpdateTaskRequest from './tasks/UpdateTaskRequest';

export {
    CreateTaskRequest,
    DeleteTasksResponse,
    GetTasksResponse,
    Task,
    TaskBase,
    UpdateTaskRequest,
};
