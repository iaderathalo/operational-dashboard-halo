import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';

/**
 * The LivenessIndicator verifies that the current API is live
 * and returns a response reflecting that.
 */
@Injectable()
export default class LivenessIndicator extends HealthIndicator {
    /**
     * A trivial example of a Health Indicator which returns a response
     * in the expected structure confirming the API is live.
     * @param {string} key - The key which will be used for the result object.
     * @returns {HealthIndicatorResult} - The result of the health indicator check.
     */
    public check(key: string): HealthIndicatorResult {
        return this.getStatus(key, true);
    }
}
