import InMemoryDatadogSnapshot from './datadog-snapshot';
import { DatadogSyntheticCheck } from './datadog.types';

describe('InMemoryDatadogSnapshot.syntheticsForTag', () => {
    const check: DatadogSyntheticCheck = {
        publicId: 'abc-def-ghi',
        name: 'login flow',
        type: 'browser',
        status: 'live',
        uptime: 99.5,
    };
    const build = () =>
        new InMemoryDatadogSnapshot(
            new Map(),
            new Map(),
            new Map([['app_short_key:sap', [check]]])
        );

    it('returns the checks tagged with the given identifier', () => {
        expect(build().syntheticsForTag('app_short_key', 'sap')).toEqual([check]);
    });

    it('matches case-insensitively (key and value)', () => {
        expect(build().syntheticsForTag('APP_SHORT_KEY', 'SAP')).toEqual([check]);
    });

    it('returns [] for an unmatched tag (never throws)', () => {
        expect(build().syntheticsForTag('app_short_key', 'nope')).toEqual([]);
        expect(build().syntheticsForTag('app_service_id', 'sap')).toEqual([]);
    });

    it('returns a defensive copy — mutating the result does not affect the index', () => {
        const snapshot = build();
        snapshot
            .syntheticsForTag('app_short_key', 'sap')
            .push({ publicId: 'x', name: '', type: '', status: '', uptime: null });
        expect(snapshot.syntheticsForTag('app_short_key', 'sap')).toEqual([check]);
    });

    it('defaults to no synthetics when the third arg is omitted (back-compat)', () => {
        const snapshot = new InMemoryDatadogSnapshot(new Map(), new Map());
        expect(snapshot.syntheticsForTag('app_short_key', 'sap')).toEqual([]);
    });
});
