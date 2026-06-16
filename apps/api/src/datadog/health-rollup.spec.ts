import { DatadogMonitor, DatadogMonitorState } from './datadog.types';
import { buildHealth, rollupStatus } from './health-rollup';

const mon = (state: DatadogMonitorState): DatadogMonitor => ({
    id: 1,
    name: 'm',
    overall_state: state,
    tags: [],
});

describe('rollupStatus (worst-state-wins)', () => {
    it('all OK -> GREEN', () => expect(rollupStatus([mon('OK'), mon('OK')])).toBe('GREEN'));
    it('Warn + OK -> AMBER', () => expect(rollupStatus([mon('OK'), mon('Warn')])).toBe('AMBER'));
    it('any Alert -> RED', () =>
        expect(rollupStatus([mon('OK'), mon('Warn'), mon('Alert')])).toBe('RED'));
    it('all No Data -> AMBER', () =>
        expect(rollupStatus([mon('No Data'), mon('No Data')])).toBe('AMBER'));
    it('empty set -> AMBER (never GREEN)', () => expect(rollupStatus([])).toBe('AMBER'));
});

describe('buildHealth', () => {
    it('unmapped: AMBER, datadogMapped false, all metrics null', () => {
        const h = buildHealth([], null, 'unmapped');
        expect(h.healthStatus).toBe('AMBER');
        expect(h.datadogMapped).toBe(false);
        expect(h.uptime30d).toBeNull();
        expect(h.errorBudgetRemainingPct).toBeNull();
        expect(h.resolutionPath).toBe('unmapped');
    });

    it('mapped with SLO: carries uptime and error budget', () => {
        const h = buildHealth(
            [mon('OK')],
            {
                sloId: 's',
                target: 99.5,
                errorBudgetRemainingPct: 80,
                uptime24h: 99.9,
                uptime7d: 99.8,
                uptime30d: 99.7,
            },
            'primary'
        );
        expect(h.healthStatus).toBe('GREEN');
        expect(h.datadogMapped).toBe(true);
        expect(h.uptime30d).toBe(99.7);
        expect(h.slaTarget).toBe(99.5);
        expect(h.errorBudgetRemainingPct).toBe(80);
    });

    it('mapped without SLO: still mapped, metrics null', () => {
        const h = buildHealth([mon('Warn')], null, 'fallback');
        expect(h.healthStatus).toBe('AMBER');
        expect(h.datadogMapped).toBe(true);
        expect(h.uptime30d).toBeNull();
        expect(h.errorBudgetRemainingPct).toBeNull();
    });
});
