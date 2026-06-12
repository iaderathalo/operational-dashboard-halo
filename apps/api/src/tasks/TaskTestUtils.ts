import { TaskBase, Task } from '@operational-dashboard/shared-api-model/model/tasks';

import mockTaskId from './mockTaskId';

/**
 * Testing utils for the local Jest tests.
 */
export default class TaskTestUtils {
    /**
     * Utility method for creating a task for tests.
     * @param {number} identifier - An unique identifier to create a test task.
     * @returns {TaskBase} A Task with values that are base on the passed in identifier.
     */
    public static mockTaskNoId(identifier: number): TaskBase {
        const result = {} as TaskBase;

        result.name = `Task Name ${identifier}`;
        result.description = `Task Description ${identifier}`;
        result.priority = identifier;

        return result;
    }

    /**
     * Utility method for creating a task for tests.
     * @param {number} identifier - An unique identifier to create a test task.
     * @returns {Task} A Task with values that are base on the passed in identifier.
     */
    public static mockTaskWithId(identifier: number): Task {
        const result = this.mockTaskNoId(identifier) as Task;
        result.id = mockTaskId();
        return result;
    }
}
