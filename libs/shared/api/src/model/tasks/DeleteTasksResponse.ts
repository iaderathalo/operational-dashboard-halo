/**
 * Interface for the response object that is returned in the body to a DELETE request to /tasks.
 *
 * The operation returns the number of tasks that were deleted.
 */
export default interface DeleteTasksResponse {
    /**
     * The number of tasks that were deleted.
     */
    numTasksDeleted?: number;
}
