/**
 * Interface for the request object that is passed as the body of a PUT request to /tasks/{taskId}.
 *
 * The details in this object will be used to update an existing task for the user.
 */
import Task from './Task';

type UpdateTaskRequest = Task;

export default UpdateTaskRequest;
