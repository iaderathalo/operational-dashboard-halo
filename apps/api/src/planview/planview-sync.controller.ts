import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import PlanviewSyncService, { PlanviewSyncSummary } from './planview-sync.service';
import AllowControllerWithNoBearer from '../app/common/allowControllerWithNoBearer';
import InternalSyncGuard from '../datadog/internal-sync.guard';

/**
 * Internal-only endpoint for triggering a PlanView portfolio sync.
 * Reuses the same InternalSyncGuard (shared secret) as the Datadog sync.
 * Resolves to POST /api/v1/internal/sync/planview.
 */
@Controller('internal/sync')
@AllowControllerWithNoBearer()
@UseGuards(InternalSyncGuard)
export default class PlanviewSyncController {
    /**
     * @param {PlanviewSyncService} planviewSyncService - the sync service
     * @param {Logger} logger - the Polaris logger
     */
    constructor(
        private readonly planviewSyncService: PlanviewSyncService,
        private readonly logger: Logger
    ) {}

    /**
     * Triggers a PlanView portfolio re-sync from Dremio or the static file.
     * @returns {Promise<PlanviewSyncSummary>} sync result summary
     */
    @Post('planview')
    @HttpCode(HttpStatus.OK)
    async syncPlanview(): Promise<PlanviewSyncSummary> {
        this.logger.info('Internal PlanView sync triggered');
        return this.planviewSyncService.syncAll();
    }
}
