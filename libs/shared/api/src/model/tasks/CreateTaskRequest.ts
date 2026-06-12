/**
 * Interface for the request object that is passed as the body to a POST request to /tasks.
 *
 * The details in this object will be used to create a new task for the user.
 */
import TaskBase from './TaskBase';

type CreateTaskRequest = TaskBase;

export default CreateTaskRequest;
