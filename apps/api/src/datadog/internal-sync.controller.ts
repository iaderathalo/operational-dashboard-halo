import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import DatadogSyncService from './datadog-sync.service';
import InternalSyncGuard from './internal-sync.guard';
import AllowControllerWithNoBearer from '../app/common/allowControllerWithNoBearer';

/** Acknowledgement body returned by the fire-and-forget trigger. */
export interface SyncAccepted {
    status: 'accepted';
}

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
     * @param datadogSyncService - service that owns the background sync and in-flight guard
     * @param logger - structured logger
     */
    constructor(
        private readonly datadogSyncService: DatadogSyncService,
        private readonly logger: Logger
    ) {}

    /**
     * Fire-and-forget trigger for the Datadog fleet sync. Returns 202 immediately and
     * runs {@link DatadogSyncService.triggerSync} in the background. Returns 409 when
     * a run is already in progress (guard is in the service layer).
     * @returns {SyncAccepted} acknowledgement that the run has been accepted
     */
    @Post('datadog')
    @HttpCode(HttpStatus.ACCEPTED)
    syncDatadog(): SyncAccepted {
        this.logger.info('Internal Datadog sync triggered');
        this.datadogSyncService.triggerSync();
        return { status: 'accepted' };
    }
}
