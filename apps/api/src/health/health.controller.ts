import { Logger } from '@mmctech-artifactory/polaris-logger';
import {
    Controller,
    Get,
    UseInterceptors,
    ClassSerializerInterceptor,
    ServiceUnavailableException,
} from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import LivenessIndicator from './health-indicators/liveness-indicator';
import AllowControllerWithNoBearer from '../app/common/allowControllerWithNoBearer';

/**
 * The HealthController is used for monitoring the health of the application. It
 * utilizes the NestJS Terminus (https://docs.nestjs.com/recipes/terminus) functionality.
 *
 * This controller has the AllowControllerWithNoBearer decorator which allows it to be
 * called unauthenticated. This is intentional so that this endpoint can be invoked
 * by Kubernetes readiness and liveness probes.
 */
@Controller('/health')
@UseInterceptors(ClassSerializerInterceptor)
@AllowControllerWithNoBearer()
export default class HealthController {
    /**
     * @param {HealthCheckService} health - Service for executing the indicators and aggregating the results.
     * @param {LivenessIndicator} livenessIndicator - The liveness health indicator to use for checks.
     * @param {Logger} logger - Instance of the Polaris logger.
     */
    constructor(
        private readonly health: HealthCheckService,
        private readonly livenessIndicator: LivenessIndicator,
        private readonly logger: Logger
    ) {}

    /**
     * Checks the health of the application and returns a HTTP 200 status code when
     * healthy or a HTTP 503 status code when unhealthy.
     * @returns {Promise<void>} - No details are returned to avoid exposing internal information
     * about the API. A 200 response indicates success.
     * @throws {ServiceUnavailableException} - Throws when the application is in an unhealthy state.
     */
    @Get()
    @HealthCheck()
    async check(): Promise<void> {
        const livenessIndicatorKey = 'api';
        try {
            const healthCheckResult = await this.health.check([
                // Additional indicators can be added here to perform extra health checks (e.g. checking the database).
                () => this.livenessIndicator.check(livenessIndicatorKey),
            ]);

            this.logger.info('Health check was successful.', { healthCheckResult });
        } catch (error) {
            this.logger.error('Health check failed with error.', { error });

            throw new ServiceUnavailableException();
        }
    }
}
