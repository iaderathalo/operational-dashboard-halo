import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import DatadogSyncService, { SyncSummary } from './datadog-sync.service';
import InternalSyncGuard from './internal-sync.guard';
import AllowControllerWithNoBearer from '../app/common/allowControllerWithNoBearer';

/**
 * Internal-only endpoint the Crawler cronjob calls once per tick. Exempt from Okta
 * (machine caller) but protected by a shared secret. Not part of the public API docs.
 * Resolves to POST /api/v1/internal/sync/datadog (global prefix in server.ts).
 */
@Controller('internal/sync')
@AllowControllerWithNoBearer()
@UseGuards(InternalSyncGuard)
export default class InternalSyncController {
    /**
     *
     * @param datadogSyncService
     * @param logger
     */
    constructor(
        private readonly datadogSyncService: DatadogSyncService,
        private readonly logger: Logger
    ) {}

    /**
     *
     */
    @Post('datadog')
    @HttpCode(HttpStatus.OK)
    async syncDatadog(): Promise<SyncSummary> {
        this.logger.info('Internal Datadog sync triggered');
        return this.datadogSyncService.syncAll();
    }
}
