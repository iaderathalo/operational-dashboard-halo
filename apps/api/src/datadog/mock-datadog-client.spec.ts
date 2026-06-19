import { DatadogSnapshot } from './datadog.types';
import MockDatadogClient from './mock-datadog-client';

describe('MockDatadogClient.loadSnapshot', () => {
    const client = new MockDatadogClient();

    let snapshot: DatadogSnapshot;
    beforeAll(async () => {
        snapshot = await client.loadSnapshot();
    });

    it('is deterministic: two snapshots resolve a key identically', async () => {
        const second = await client.loadSnapshot();
        expect(snapshot.monitorsForTag('app_short_key', 'SAP')).toEqual(
            second.monitorsForTag('app_short_key', 'SAP')
        );
        expect(snapshot.sloSummaryForTag('app_short_key', 'SPLK')).toEqual(
            second.sloSummaryForTag('app_short_key', 'SPLK')
        );
    });

    it('exposes 2-4 monitors per seeded key under app_short_key, first driving the rollup', () => {
        const monitors = snapshot.monitorsForTag('app_short_key', 'SAP');
        expect(monitors.length).toBeGreaterThanOrEqual(2);
        expect(monitors.length).toBeLessThanOrEqual(4);
        // Carries both the resolver tag and the legacy service: tag.
        expect(monitors[0].tags).toContain('app_short_key:SAP');
        expect(monitors[0].tags).toContain('service:SAP');
        // First monitor is the worst state; the rest are OK.
        expect(monitors.slice(1).every((m) => m.overall_state === 'OK')).toBe(true);
    });

    it('looks up monitors case-insensitively', () => {
        expect(snapshot.monitorsForTag('APP_SHORT_KEY', 'sap')).toEqual(
            snapshot.monitorsForTag('app_short_key', 'SAP')
        );
    });

    it('returns [] for an unknown key (never throws)', () => {
        expect(snapshot.monitorsForTag('app_short_key', 'does-not-exist')).toEqual([]);
    });

    it('returns a deterministic SLO summary for a seeded key (no uptime90d)', () => {
        const slo = snapshot.sloSummaryForTag('app_short_key', 'SPLK');
        expect(slo).not.toBeNull();
        expect(slo?.uptime30d).not.toBeNull();
        // 90d is intentionally absent from the summary (Datadog ~2-week retention).
        expect(Object.keys(slo ?? {})).not.toContain('uptime90d');
    });

    it('returns null SLO for a key the canned data leaves without an SLO', () => {
        // OHCM hashes into the ~1-in-5 "no SLO" bucket.
        expect(snapshot.sloSummaryForTag('app_short_key', 'OHCM')).toBeNull();
    });
});
