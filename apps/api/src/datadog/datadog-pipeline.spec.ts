import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { LoggerModule } from '@mmctech-artifactory/polaris-logger';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import ApplicationsService from '../applications/applications.service';
import DatadogModule from './datadog.module';
import DatadogSyncService from './datadog-sync.service';

/**
 * End-to-end demonstration of the live-health pipeline with REAL DI wiring:
 * the real DatadogModule, the mock Datadog client (no DATADOG_API_KEY), and the
 * in-memory repositories (no Mongo URL). Boots only what the Crawler path needs —
 * no OktaGuard/Apigee/swagger — so it runs anywhere. This is the same syncAll()
 * the internal endpoint triggers, now driven by the bulk loadSnapshot() model.
 */
describe('Datadog live-health pipeline (integration)', () => {
    it('syncs every application from one bulk snapshot and populates Health', async () => {
        // Force the offline mock client: an nx/jest setup may load .env into process.env,
        // and a real DATADOG_API_KEY would make loadSnapshot hit LIVE Datadog (slow +
        // non-deterministic). This integration test runs entirely on the mock.
        delete process.env.DATADOG_API_KEY;
        delete process.env.DATADOG_APP_KEY;

        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
                LoggerModule,
                DatadogModule,
            ],
        }).compile();

        const sync = moduleRef.get(DatadogSyncService);
        const applications = moduleRef.get(ApplicationsService);

        // Seed a genuinely-unresolvable app: its shortCode is NOT in the mock's canned
        // data, so the snapshot can't map it. This proves the Unmapped path end-to-end
        // (every seeded shortCode otherwise resolves via the mock).
        const unmappedShortCode = 'ZZUNMAPPED';
        await applications.create({
            name: 'Unmapped Probe',
            shortCode: unmappedShortCode,
            description: 'Has no Datadog identifier the snapshot can resolve',
            environment: 'PRODUCTION',
            tier: 4,
            businessUnit: 'QA',
            currentStatus: 'GREEN',
            currentUserCount: 0,
            monitoringSource: 'Datadog',
            teamId: 'team-qa',
        } as Application);

        const summary = await sync.syncAll();
        const all = await applications.findAll();

        /* eslint-disable no-console */
        console.log('\n=== SYNC SUMMARY ===');
        console.log(JSON.stringify(summary));
        console.log('\n=== APPLICATION HEALTH (after sync) ===');
        all.forEach((a) => {
            console.log(
                `${a.shortCode.padEnd(10)} health=${a.healthStatus}  mapped=${a.datadogMapped}  ` +
                    `uptime24h=${a.uptime24h ?? 'n/a'}  errBudget=${a.errorBudgetRemainingPct ?? 'n/a'}  (${a.resolutionPath})`
            );
        });
        /* eslint-enable no-console */

        expect(summary.appsAttempted).toBe(all.length);
        expect(summary.appsSucceeded).toBe(summary.appsAttempted);
        expect(summary.appsFailed).toBe(0);

        // A seeded demo app resolves via the mock snapshot to live-looking health.
        const sap = all.find((a) => a.shortCode === 'SAP');
        expect(sap?.datadogMapped).toBe(true);
        expect(['GREEN', 'AMBER', 'RED']).toContain(sap?.healthStatus);

        // The probe with no resolvable Datadog identifier is Unmapped + AMBER
        // (never a false green).
        const unmapped = all.find((a) => a.shortCode === unmappedShortCode);
        expect(unmapped?.datadogMapped).toBe(false);
        expect(unmapped?.resolutionPath).toBe('unmapped');
        expect(unmapped?.healthStatus).toBe('AMBER');

        await moduleRef.close();
    });
});
