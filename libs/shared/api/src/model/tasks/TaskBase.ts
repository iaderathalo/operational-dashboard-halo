/**
 * Base interface that includes fields that are common to task related interfaces.
 * @see CreateTaskRequest
 * @see Task
 * @see UpdateTaskRequest
 */
export default interface TaskBase {
    /**
     * The name of the task
     */
    name?: string;
    /**
     * The description of the task
     */
    description?: string;
    /**
     * The priority of the task. Allows sorting of tasks by priority.
     */
    priority?: number;
}
