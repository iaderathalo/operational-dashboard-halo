/**
 * Interface for the Task DTO that is returned for multiple API methods.
 * @see TaskBase TaskBase has details on additional properties of the Task.
 */
import TaskBase from './TaskBase';

export default interface Task extends TaskBase {
    /**
     * The ID for the task. This value will only be created by the server side
     * when a task is created.
     *
     * It should be a 24 character hex string, which will be populated with a
     * stringified MongoDB ObjectID.
     */
    id?: string;
}
