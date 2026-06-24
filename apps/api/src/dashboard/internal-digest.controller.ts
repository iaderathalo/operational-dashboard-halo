import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { DigestSummary } from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardService from './dashboard.service';
import AllowControllerWithNoBearer from '../app/common/allowControllerWithNoBearer';
import InternalSyncGuard from '../datadog/internal-sync.guard';

/**
 * Internal-only endpoint an EXTERNAL scheduler (the same cron mechanism that drives the
 * Datadog sync) calls on the configured cadence to run the executive digest (11-4).
 * Mirrors InternalSyncController: exempt from Okta (machine caller) but protected by the
 * shared INTERNAL_SYNC_TOKEN secret. No in-process scheduler is added.
 * Resolves to POST /api/v1/internal/digest/run (global prefix in server.ts).
 */
@Controller('internal/digest')
@AllowControllerWithNoBearer()
@UseGuards(InternalSyncGuard)
export default class InternalDigestController {
    /**
     * Creates the internal digest controller.
     * @param {object} dashboardService - service that derives the digest
     * @param {object} logger - Polaris logger instance
     */
    constructor(
        private readonly dashboardService: DashboardService,
        private readonly logger: Logger
    ) {}

    /**
     * Runs the digest over the full (unscoped) portfolio and returns it.
     * @returns {Promise<object>} the generated digest summary
     */
    @Post('run')
    @HttpCode(HttpStatus.OK)
    async run(): Promise<DigestSummary> {
        this.logger.info('Internal executive digest run triggered');
        return this.dashboardService.getDigest();
    }
}
