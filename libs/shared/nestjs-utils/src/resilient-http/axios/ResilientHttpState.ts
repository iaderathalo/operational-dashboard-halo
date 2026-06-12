/**
 * Represents the state that must be maintained across resilient HTTP requests.
 */
export default interface ResilientHttpState {
    /**
     * The retry number that the current request represents.
     */
    retryNumber: number;
}
