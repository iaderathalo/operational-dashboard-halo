import { DatadogMonitor, DatadogMonitorState } from './datadog.types';
import { buildHealth, buildMonitorBreakdown, rollupStatus } from './health-rollup';

const mon = (state: DatadogMonitorState): DatadogMonitor => ({
    id: 1,
    name: 'm',
    overall_state: state,
    tags: [],
});

const monRich = (over: Partial<DatadogMonitor>): DatadogMonitor => ({
    id: 1,
    name: 'm',
    overall_state: 'OK',
    tags: [],
    ...over,
});

describe('rollupStatus (worst-state-wins)', () => {
    it('all OK -> GREEN', () => expect(rollupStatus([mon('OK'), mon('OK')])).toBe('GREEN'));
    it('Warn + OK -> AMBER', () => expect(rollupStatus([mon('OK'), mon('Warn')])).toBe('AMBER'));
    it('any Alert -> RED', () =>
        expect(rollupStatus([mon('OK'), mon('Warn'), mon('Alert')])).toBe('RED'));
    it('all No Data -> AMBER', () =>
        expect(rollupStatus([mon('No Data'), mon('No Data')])).toBe('AMBER'));
    it('empty set -> AMBER (never GREEN)', () => expect(rollupStatus([])).toBe('AMBER'));

    it('suppresses a downtimed Alert: Alert(in downtime) + OK -> GREEN', () =>
        expect(
            rollupStatus([
                monRich({ overall_state: 'Alert', matching_downtimes: [{ id: 1 }] }),
                monRich({ overall_state: 'OK' }),
            ])
        ).toBe('GREEN'));

    it('all monitors in downtime -> AMBER (no false RED)', () =>
        expect(
            rollupStatus([monRich({ overall_state: 'Alert', matching_downtimes: [{ id: 1 }] })])
        ).toBe('AMBER'));
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

describe('buildMonitorBreakdown', () => {
    it('empty set -> []', () => expect(buildMonitorBreakdown([])).toEqual([]));

    it('maps state->status, trims message, carries last-triggered', () => {
        const [m] = buildMonitorBreakdown([
            monRich({
                id: 5,
                name: 'API',
                overall_state: 'Alert',
                message: '  boom  ',
                overall_state_modified: '2026-06-16T17:36:00Z',
            }),
        ]);
        expect(m).toEqual({
            id: 5,
            name: 'API',
            status: 'RED',
            message: 'boom',
            lastTriggeredAt: '2026-06-16T17:36:00Z',
            inMaintenance: false,
        });
    });

    it('flags a monitor in an active downtime as inMaintenance', () => {
        const [m] = buildMonitorBreakdown([
            monRich({ overall_state: 'Alert', matching_downtimes: [{ id: 1 }] }),
        ]);
        expect(m.inMaintenance).toBe(true);
    });

    it('defaults a missing message to "" and last-triggered to null', () => {
        const [m] = buildMonitorBreakdown([monRich({ overall_state: 'OK' })]);
        expect(m.message).toBe('');
        expect(m.lastTriggeredAt).toBeNull();
    });

    it('sorts worst-state first, then by name', () => {
        const names = buildMonitorBreakdown([
            monRich({ name: 'b-ok', overall_state: 'OK' }),
            monRich({ name: 'a-alert', overall_state: 'Alert' }),
            monRich({ name: 'c-warn', overall_state: 'Warn' }),
            monRich({ name: 'a-ok', overall_state: 'OK' }),
        ]).map((m) => m.name);
        expect(names).toEqual(['a-alert', 'c-warn', 'a-ok', 'b-ok']);
    });
});
