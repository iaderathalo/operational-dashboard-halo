import { Logger } from '@mmctech-artifactory/polaris-logger';
import { mock, MockProxy } from 'jest-mock-extended';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { DatadogClient } from './datadog-client';
import DatadogSyncService from './datadog-sync.service';
import { DatadogMonitor, DatadogSloSummary, DatadogSnapshot } from './datadog.types';
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
