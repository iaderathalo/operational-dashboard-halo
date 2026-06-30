import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ConflictException, Inject, Injectable } from '@nestjs/common';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { DatadogClient } from './datadog-client';
import {
    DatadogMonitor,
    DatadogSloSummary,
    DatadogSnapshot,
    DatadogSyntheticCheck,
} from './datadog.types';
import { buildHealth, buildMonitorBreakdown, buildSyntheticBreakdown } from './health-rollup';
import ApplicationsService from '../applications/applications.service';
import { HealthSnapshotRepository } from '../health-snapshots/health-snapshot.repository';

export interface SyncSummary {
    appsAttempted: number;
    appsSucceeded: number;
    appsFailed: number;
    durationMs: number;
}

interface Resolution {
    monitors: DatadogMonitor[];
    slo: DatadogSloSummary | null;
    synthetics: DatadogSyntheticCheck[];
    resolutionPath: 'primary' | 'fallback' | 'unmapped';
}

@Injectable()
export default class DatadogSyncService {
    /** In-flight guard — true while a background syncAll() run is executing. */
    private syncing = false;

    /**
     * @param datadog - Datadog HTTP client
     * @param snapshots - health-snapshot repository
     * @param applicationsService - application persistence service
     * @param logger - structured logger
     */
    constructor(
        @Inject('DatadogClient') private readonly datadog: DatadogClient,
        @Inject('HealthSnapshotRepository') private readonly snapshots: HealthSnapshotRepository,
        private readonly applicationsService: ApplicationsService,
        private readonly logger: Logger
    ) {}

    /**
     * Fire-and-forget entry point used by the controller. Returns immediately after
     * dispatching {@link syncAll} in the background. Throws {@link ConflictException}
     * (HTTP 409) when a run is already in progress so that a concurrent caller is
     * rejected rather than starting a duplicate.
     *
     * The in-flight flag is always cleared via {@code .finally} so a failed run does
     * not permanently wedge the endpoint.
     * @returns {void}
     */
    triggerSync(): void {
        if (this.syncing) {
            this.logger.warn(
                'Datadog sync [rejected] — a run is already in progress; concurrent trigger dropped'
            );
            throw new ConflictException('A Datadog sync is already in progress');
        }

        this.syncing = true;
        const startedAt = Date.now();
        this.logger.info('Datadog sync [started] — background run dispatched');

        this.syncAll()
            .then((summary) => {
                const durationMs = Date.now() - startedAt;
                this.logger.info('Datadog sync [completed]', {
                    appsAttempted: summary.appsAttempted,
                    appsSucceeded: summary.appsSucceeded,
                    appsFailed: summary.appsFailed,
                    durationMs,
                });
            })
            .catch((err: unknown) => {
                const durationMs = Date.now() - startedAt;
                const message = err instanceof Error ? err.message : String(err);
                const stack = err instanceof Error ? err.stack : undefined;
                this.logger.error('Datadog sync [failed] — fatal run error', {
                    message,
                    stack,
                    elapsedMs: durationMs,
                });
            })
            .finally(() => {
                this.syncing = false;
            });
    }

    /**
     * Pull telemetry for every Application, compute Health, and persist it.
     *
     * Telemetry is fetched ONCE up front as a bulk {@link DatadogSnapshot} (a handful
     * of paginated Datadog calls for the whole fleet), then every app is resolved
     * against it with purely LOCAL lookups — there is ZERO Datadog HTTP inside the
     * per-app loop. This is what keeps a full sync off Datadog's 429 rate limits.
     *
     * Per-app failures are isolated so one bad app does not fail the run. A failure to
     * load the snapshot itself is fatal (there is nothing to resolve against) and
     * propagates to the caller.
     * @returns {Promise<SyncSummary>} counts + duration for the run
     */
    async syncAll(): Promise<SyncSummary> {
        const start = Date.now();

        // ONE bulk fetch for the whole fleet. If this throws, the run fails fast.
        const snapshot = await this.datadog.loadSnapshot();

        let apps = await this.applicationsService.findAll();

        // Optional targeted re-sync (comma-separated shortCodes) so a single app can
        // be refreshed without persisting the whole catalog.
        const only = (process.env.SYNC_APP_SHORTCODES || '')
            .split(',')
            .map((code) => code.trim().toLowerCase())
            .filter(Boolean);
        if (only.length) {
            const wanted = new Set(only);
            apps = apps.filter((app) => wanted.has((app.shortCode || '').toLowerCase()));
        }

        // Bounded concurrency for the Mongo writes only (resolution is in-memory now).
        // Process in batches of SYNC_CONCURRENCY so we never burst thousands of writes.
        const concurrency = Math.max(1, Number(process.env.SYNC_CONCURRENCY) || 8);
        const outcomes: boolean[] = [];
        for (let offset = 0; offset < apps.length; offset += concurrency) {
            const batch = apps.slice(offset, offset + concurrency);
            // eslint-disable-next-line no-await-in-loop
            const batchOutcomes = await Promise.all(
                batch.map((app) => this.syncOneSafe(app, snapshot))
            );
            outcomes.push(...batchOutcomes);
        }

        const appsSucceeded = outcomes.filter(Boolean).length;
        const summary: SyncSummary = {
            appsAttempted: apps.length,
            appsSucceeded,
            appsFailed: apps.length - appsSucceeded,
            durationMs: Date.now() - start,
        };
        this.logger.info('Datadog sync complete', {
            appsAttempted: summary.appsAttempted,
            appsSucceeded: summary.appsSucceeded,
            appsFailed: summary.appsFailed,
            durationMs: summary.durationMs,
        });
        return summary;
    }

    /**
     * Resolve + persist one app, converting any failure into a recorded error so the
     * rest of the run continues.
     * @param {Application} app - the application to sync
     * @param {DatadogSnapshot} snapshot - the bulk snapshot to resolve against
     * @returns {Promise<boolean>} true on success, false when the app was marked errored
     */
    private async syncOneSafe(app: Application, snapshot: DatadogSnapshot): Promise<boolean> {
        try {
            await this.syncOne(app, snapshot);
            return true;
        } catch (error) {
            this.logger.error(`Datadog sync failed for application [${app.id}]`, { error });
            try {
                await this.applicationsService.applyHealthUpdate(app, {
                    lastSyncStatus: 'error',
                    lastSyncAt: new Date().toISOString(),
                });
            } catch {
                // best-effort: marking the error must not itself fail the run
            }
            return false;
        }
    }

    /**
     * Compute and persist health for one app from the bulk snapshot.
     * @param {Application} app - the application to sync
     * @param {DatadogSnapshot} snapshot - the bulk snapshot to resolve against
     * @returns {Promise<void>}
     */
    private async syncOne(app: Application, snapshot: DatadogSnapshot): Promise<void> {
        const { monitors, slo, synthetics, resolutionPath } = DatadogSyncService.resolve(
            app,
            snapshot
        );
        const health = buildHealth(monitors, slo, resolutionPath);
        const monitorBreakdown = buildMonitorBreakdown(monitors);
        const failingMonitors = monitorBreakdown
            .filter((m) => m.status !== 'GREEN')
            .map((m) => ({ name: m.name, status: m.status }));
        const now = new Date().toISOString();

        await this.applicationsService.applyHealthUpdate(app, {
            ...health,
            monitors: monitorBreakdown,
            syntheticChecks: buildSyntheticBreakdown(synthetics),
            lastSyncAt: now,
            lastSyncStatus: resolutionPath === 'unmapped' ? 'unmapped' : 'ok',
        });

        await this.snapshots.insertSnapshot({
            applicationId: app.id as string,
            status: health.healthStatus,
            uptimePct: health.uptime30d,
            datadogMapped: health.datadogMapped,
            monitorCount: monitors.length,
            resolutionPath,
            recordedAt: now,
            failingMonitors,
        });
    }

    /**
     * Purely LOCAL resolution against the snapshot — no HTTP. Primary identifier is
     * the application's CAST key (= shortCode), which this Datadog org carries on
     * monitors as the `app_short_key` tag; datadogServiceId is an optional manual
     * override. Fallback is the ServiceNow id, carried as `app_service_id`. An app
     * matching no monitors under either is treated as unmapped (not "mapped with No
     * Data"), so the dashboard shows grey. SLO is attached for the resolved tag only.
     * @param {Application} app - the application to resolve
     * @param {DatadogSnapshot} snapshot - the bulk snapshot to resolve against
     * @returns {Resolution} monitors + slo + resolution path
     */
    private static resolve(app: Application, snapshot: DatadogSnapshot): Resolution {
        const shortKey = app.datadogServiceId || app.shortCode;
        if (shortKey) {
            const monitors = snapshot.monitorsForTag('app_short_key', shortKey);
            if (monitors.length > 0) {
                return {
                    monitors,
                    slo: snapshot.sloSummaryForTag('app_short_key', shortKey),
                    synthetics: snapshot.syntheticsForTag('app_short_key', shortKey) ?? [],
                    resolutionPath: 'primary',
                };
            }
        }
        if (app.serviceNowKey) {
            const monitors = snapshot.monitorsForTag('app_service_id', app.serviceNowKey);
            if (monitors.length > 0) {
                return {
                    monitors,
                    slo: snapshot.sloSummaryForTag('app_service_id', app.serviceNowKey),
                    synthetics:
                        snapshot.syntheticsForTag('app_service_id', app.serviceNowKey) ?? [],
                    resolutionPath: 'fallback',
                };
            }
        }
        return { monitors: [], slo: null, synthetics: [], resolutionPath: 'unmapped' };
    }
}
