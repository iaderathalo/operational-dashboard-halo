import Task from './Task';

/**
 * Interface for the response object that is returned in the body to a GET request to /tasks.
 */
export default interface GetTasksResponse {
    /**
     * The returned list of user tasks
     */
    tasks?: Array<Task>;
}
