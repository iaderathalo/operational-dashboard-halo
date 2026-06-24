import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ConflictException } from '@nestjs/common';
import { mock, MockProxy } from 'jest-mock-extended';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { DatadogClient } from './datadog-client';
import DatadogSyncService from './datadog-sync.service';
import {
    DatadogMonitor,
    DatadogSloSummary,
    DatadogSnapshot,
    DatadogSyntheticCheck,
} from './datadog.types';
import ApplicationsService from '../applications/applications.service';
import { HealthSnapshotRepository } from '../health-snapshots/health-snapshot.repository';

const monitor = (overall_state: DatadogMonitor['overall_state']): DatadogMonitor => ({
    id: 1,
    name: 'm',
    overall_state,
    tags: [],
});

const slo: DatadogSloSummary = {
    sloId: 's',
    target: 99.5,
    errorBudgetRemainingPct: 70,
    uptime24h: 99.9,
    uptime7d: 99.8,
    uptime30d: 99.7,
};

const synthetic: DatadogSyntheticCheck = {
    publicId: 'syn-1',
    name: 'login flow',
    type: 'browser',
    status: 'live',
    uptime: 99.4,
};

describe('DatadogSyncService.syncAll', () => {
    let service: DatadogSyncService;
    let datadog: MockProxy<DatadogClient>;
    let snapshot: MockProxy<DatadogSnapshot>;
    let applicationsService: MockProxy<ApplicationsService>;
    let snapshots: MockProxy<HealthSnapshotRepository>;

    const mappedApp = {
        id: 'a1',
        name: 'IntelliFi',
        shortCode: 'IFI',
        datadogServiceId: 'intellifi',
    } as Application;
    const fallbackApp = {
        id: 'a3',
        name: 'Relay',
        shortCode: 'RLY',
        serviceNowKey: 'snow-relay',
    } as Application;
    const unmappedApp = { id: 'a2', name: 'Beacon', shortCode: 'BCN' } as Application;

    beforeEach(() => {
        datadog = mock<DatadogClient>();
        snapshot = mock<DatadogSnapshot>();
        applicationsService = mock<ApplicationsService>();
        snapshots = mock<HealthSnapshotRepository>();

        datadog.loadSnapshot.mockResolvedValue(snapshot);
        // Default: nothing resolves. Individual tests opt specific tags in.
        snapshot.monitorsForTag.mockReturnValue([]);
        snapshot.sloSummaryForTag.mockReturnValue(null);

        service = new DatadogSyncService(datadog, snapshots, applicationsService, mock<Logger>());
    });

    it('loads the snapshot exactly once for the whole fleet', async () => {
        applicationsService.findAll.mockResolvedValue([mappedApp, fallbackApp, unmappedApp]);

        await service.syncAll();

        expect(datadog.loadSnapshot).toHaveBeenCalledTimes(1);
    });

    it('computes health for mapped and unmapped apps and records one snapshot each', async () => {
        applicationsService.findAll.mockResolvedValue([mappedApp, unmappedApp]);
        // Primary tag (app_short_key:intellifi) resolves to a Warn monitor + SLO.
        snapshot.monitorsForTag.mockImplementation((k, v) =>
            k === 'app_short_key' && v === 'intellifi' ? [monitor('Warn')] : []
        );
        snapshot.sloSummaryForTag.mockImplementation((k, v) =>
            k === 'app_short_key' && v === 'intellifi' ? slo : null
        );

        const summary = await service.syncAll();

        expect(summary.appsAttempted).toBe(2);
        expect(summary.appsSucceeded).toBe(2);
        expect(summary.appsFailed).toBe(0);

        expect(applicationsService.applyHealthUpdate).toHaveBeenCalledWith(
            mappedApp,
            expect.objectContaining({
                healthStatus: 'AMBER',
                datadogMapped: true,
                resolutionPath: 'primary',
                lastSyncStatus: 'ok',
            })
        );
        expect(applicationsService.applyHealthUpdate).toHaveBeenCalledWith(
            unmappedApp,
            expect.objectContaining({
                healthStatus: 'AMBER',
                datadogMapped: false,
                resolutionPath: 'unmapped',
                lastSyncStatus: 'unmapped',
            })
        );
        expect(snapshots.insertSnapshot).toHaveBeenCalledTimes(2);
    });

    it('persists the resolved synthetic checks on the app', async () => {
        applicationsService.findAll.mockResolvedValue([mappedApp]);
        snapshot.monitorsForTag.mockImplementation((k, v) =>
            k === 'app_short_key' && v === 'intellifi' ? [monitor('OK')] : []
        );
        snapshot.syntheticsForTag.mockImplementation((k, v) =>
            k === 'app_short_key' && v === 'intellifi' ? [synthetic] : []
        );

        await service.syncAll();

        expect(applicationsService.applyHealthUpdate).toHaveBeenCalledWith(
            mappedApp,
            expect.objectContaining({
                syntheticChecks: [
                    expect.objectContaining({ name: 'login flow', status: 'live', uptime: 99.4 }),
                ],
            })
        );
    });

    it('falls back to app_service_id (serviceNowKey) when the primary tag is empty', async () => {
        applicationsService.findAll.mockResolvedValue([fallbackApp]);
        snapshot.monitorsForTag.mockImplementation((k, v) =>
            k === 'app_service_id' && v === 'snow-relay' ? [monitor('OK')] : []
        );

        const summary = await service.syncAll();

        expect(summary.appsSucceeded).toBe(1);
        expect(applicationsService.applyHealthUpdate).toHaveBeenCalledWith(
            fallbackApp,
            expect.objectContaining({
                healthStatus: 'GREEN',
                datadogMapped: true,
                resolutionPath: 'fallback',
                lastSyncStatus: 'ok',
            })
        );
        // app_short_key first (IFI shortCode / RLY shortCode), then app_service_id.
        expect(snapshot.monitorsForTag).toHaveBeenCalledWith('app_short_key', 'RLY');
        expect(snapshot.monitorsForTag).toHaveBeenCalledWith('app_service_id', 'snow-relay');
    });

    it('isolates a per-app failure and marks lastSyncStatus error', async () => {
        applicationsService.findAll.mockResolvedValue([mappedApp]);
        snapshot.monitorsForTag.mockReturnValue([monitor('Warn')]);
        // The health write fails for this app; the run must still complete and the
        // app must be marked errored, with no health snapshot inserted.
        applicationsService.applyHealthUpdate.mockImplementation(async (_app, health) => {
            if (health.lastSyncStatus !== 'error') throw new Error('write failed');
        });

        const summary = await service.syncAll();

        expect(summary.appsFailed).toBe(1);
        expect(summary.appsSucceeded).toBe(0);
        expect(applicationsService.applyHealthUpdate).toHaveBeenCalledWith(
            mappedApp,
            expect.objectContaining({ lastSyncStatus: 'error' })
        );
        expect(snapshots.insertSnapshot).not.toHaveBeenCalled();
    });

    it('does not resolve apps filtered out by SYNC_APP_SHORTCODES', async () => {
        applicationsService.findAll.mockResolvedValue([mappedApp, unmappedApp]);
        process.env.SYNC_APP_SHORTCODES = 'bcn';
        try {
            const summary = await service.syncAll();
            expect(summary.appsAttempted).toBe(1);
            expect(applicationsService.applyHealthUpdate).toHaveBeenCalledWith(
                unmappedApp,
                expect.objectContaining({ resolutionPath: 'unmapped' })
            );
            expect(applicationsService.applyHealthUpdate).not.toHaveBeenCalledWith(
                mappedApp,
                expect.anything()
            );
        } finally {
            delete process.env.SYNC_APP_SHORTCODES;
        }
    });
});

// ---------------------------------------------------------------------------
// triggerSync — in-flight guard, flag lifecycle, error catch
// ---------------------------------------------------------------------------
describe('DatadogSyncService.triggerSync', () => {
    let service: DatadogSyncService;
    let datadog: MockProxy<DatadogClient>;
    let snapshot: MockProxy<DatadogSnapshot>;
    let applicationsService: MockProxy<ApplicationsService>;
    let snapshots: MockProxy<HealthSnapshotRepository>;
    let logger: MockProxy<Logger>;

    beforeEach(() => {
        datadog = mock<DatadogClient>();
        snapshot = mock<DatadogSnapshot>();
        applicationsService = mock<ApplicationsService>();
        snapshots = mock<HealthSnapshotRepository>();
        logger = mock<Logger>();

        datadog.loadSnapshot.mockResolvedValue(snapshot);
        snapshot.monitorsForTag.mockReturnValue([]);
        snapshot.sloSummaryForTag.mockReturnValue(null);
        applicationsService.findAll.mockResolvedValue([]);

        service = new DatadogSyncService(datadog, snapshots, applicationsService, logger);
    });

    it('invokes syncAll once when triggered', async () => {
        const syncAllSpy = jest.spyOn(service, 'syncAll').mockResolvedValue({
            appsAttempted: 0,
            appsSucceeded: 0,
            appsFailed: 0,
            durationMs: 1,
        });

        service.triggerSync();

        // Flush microtasks so the detached promise settles
        await new Promise<void>((res) => {
            setImmediate(res);
        });

        expect(syncAllSpy).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException and calls syncAll only once while in-flight', async () => {
        // Never-resolving promise keeps the flag set permanently in this test
        let resolveRun!: () => void;
        const held = new Promise<SyncSummary>((res) => {
            resolveRun = () =>
                res({ appsAttempted: 0, appsSucceeded: 0, appsFailed: 0, durationMs: 0 });
        });
        const syncAllSpy = jest.spyOn(service, 'syncAll').mockReturnValue(held);

        // First trigger — accepted, run held in-flight
        service.triggerSync();
        expect(syncAllSpy).toHaveBeenCalledTimes(1);

        // Second trigger while the first is still running — must reject with 409
        expect(() => service.triggerSync()).toThrow(ConflictException);
        expect(syncAllSpy).toHaveBeenCalledTimes(1);

        // Cleanup: let the held promise settle so no async leak
        resolveRun();
        await new Promise<void>((res) => {
            setImmediate(res);
        });
    });

    it('releases the in-flight flag after a successful run so a later trigger is accepted', async () => {
        let callCount = 0;
        const syncAllSpy = jest.spyOn(service, 'syncAll').mockImplementation(async () => {
            callCount += 1;
            return { appsAttempted: 0, appsSucceeded: 0, appsFailed: 0, durationMs: 1 };
        });

        service.triggerSync();
        await new Promise<void>((res) => {
            setImmediate(res);
        });

        // Flag is cleared — second trigger must be accepted (not throw)
        service.triggerSync();
        await new Promise<void>((res) => {
            setImmediate(res);
        });

        expect(syncAllSpy).toHaveBeenCalledTimes(2);
        expect(callCount).toBe(2);
    });

    it('releases the in-flight flag after a failed run so a later trigger is accepted', async () => {
        const syncAllSpy = jest
            .spyOn(service, 'syncAll')
            .mockRejectedValueOnce(new Error('snapshot fetch exploded'))
            .mockResolvedValueOnce({
                appsAttempted: 0,
                appsSucceeded: 0,
                appsFailed: 0,
                durationMs: 1,
            });

        service.triggerSync();
        await new Promise<void>((res) => {
            setImmediate(res);
        });

        // Flag must be released even after a fatal failure
        service.triggerSync();
        await new Promise<void>((res) => {
            setImmediate(res);
        });

        expect(syncAllSpy).toHaveBeenCalledTimes(2);
    });

    it('catches a rejected syncAll (no unhandled rejection) and calls logger.error', async () => {
        const boom = new Error('fatal snapshot error');
        boom.stack = 'Error: fatal snapshot error\n    at syncAll (fake.ts:1:1)';
        jest.spyOn(service, 'syncAll').mockRejectedValue(boom);

        service.triggerSync();
        await new Promise<void>((res) => {
            setImmediate(res);
        });

        expect(logger.error).toHaveBeenCalledWith(
            'Datadog sync [failed] — fatal run error',
            expect.objectContaining({
                message: boom.message,
                stack: boom.stack,
            })
        );
    });

    it('logs a warn when a concurrent trigger is rejected', async () => {
        let resolveRun!: () => void;
        const held = new Promise<SyncSummary>((res) => {
            resolveRun = () =>
                res({ appsAttempted: 0, appsSucceeded: 0, appsFailed: 0, durationMs: 0 });
        });
        jest.spyOn(service, 'syncAll').mockReturnValue(held);

        service.triggerSync();
        expect(() => service.triggerSync()).toThrow(ConflictException);

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('concurrent trigger dropped')
        );

        // Cleanup
        resolveRun();
        await new Promise<void>((res) => {
            setImmediate(res);
        });
    });
});

// Alias so the never-resolving held-promise tests compile cleanly
type SyncSummary = import('./datadog-sync.service').SyncSummary;
