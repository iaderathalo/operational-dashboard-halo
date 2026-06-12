/**
 * Represents the default config entry in the ResilientHttpConfig.
 */
export default interface ResilientHttpConfigDefault {
    /**
     * The HTTP request methods to match against.
     */
    methods: Array<string>;

    /**
     * The number of retries to be performed.
     */
    retries: number;

    /**
     * The delay in milliseconds between retries.
     */
    retryDelayMs: number;

    /**
     * The HTTP response status codes to match against.
     */
    responseStatusCodes: Array<number>;

    /**
     * The exponent to be used when exponential back-off is required for the retries.
     * Only an exponent > 1 will denote to use exponential back-off.
     */
    exponent: number;
}
