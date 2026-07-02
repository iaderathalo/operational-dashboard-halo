import { ApplicationSyntheticCheck } from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioApp } from './models/portfolio.model';
import {
    classifySyntheticState,
    collectSynthetics,
    countSyntheticsByState,
    SYNTHETIC_GOOD_THRESHOLD,
} from './synthetic-rollup.util';

/**
 * Minimal PortfolioApp builder for synthetic rollup tests.
 * @param overrides
 */
function makeApp(overrides: Partial<PortfolioApp> = {}): PortfolioApp {
    return {
        id: 'test-id',
        name: 'Test App',
        health: 'green',
        perception: 'green',
        uptime: null,
        users: 0,
        totalInternalUsers: 0,
        totalExternalUsers: 0,
        activeUsers: null,
        incidents: 0,
        lastIncident: '',
        ...overrides,
    };
}

/**
 * Minimal synthetic check builder.
 * @param overrides
 */
function makeCheck(overrides: Partial<ApplicationSyntheticCheck> = {}): ApplicationSyntheticCheck {
    return {
        publicId: 'chk-1',
        name: 'Test Check',
        type: 'api',
        status: 'live',
        uptime: 99.5,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// SYNTHETIC_GOOD_THRESHOLD
// ---------------------------------------------------------------------------

describe('SYNTHETIC_GOOD_THRESHOLD', () => {
    it('should be 99', () => {
        expect(SYNTHETIC_GOOD_THRESHOLD).toBe(99);
    });
});

// ---------------------------------------------------------------------------
// classifySyntheticState
// ---------------------------------------------------------------------------

describe('classifySyntheticState', () => {
    it('returns paused when status is paused', () => {
        expect(classifySyntheticState(makeCheck({ status: 'paused', uptime: 99.9 }))).toBe(
            'paused'
        );
    });

    it('returns noData when uptime is null', () => {
        expect(classifySyntheticState(makeCheck({ status: 'live', uptime: null }))).toBe('noData');
    });

    it('returns degraded when uptime < 99', () => {
        expect(classifySyntheticState(makeCheck({ status: 'live', uptime: 98.5 }))).toBe(
            'degraded'
        );
    });

    it('returns passing when uptime >= 99', () => {
        expect(classifySyntheticState(makeCheck({ status: 'live', uptime: 99 }))).toBe('passing');
    });

    it('returns passing when uptime is 100', () => {
        expect(classifySyntheticState(makeCheck({ status: 'live', uptime: 100 }))).toBe('passing');
    });

    it('paused takes priority over null uptime', () => {
        expect(classifySyntheticState(makeCheck({ status: 'paused', uptime: null }))).toBe(
            'paused'
        );
    });
});

// ---------------------------------------------------------------------------
// countSyntheticsByState
// ---------------------------------------------------------------------------

describe('countSyntheticsByState', () => {
    it('returns all-zero counts for empty apps list', () => {
        expect(countSyntheticsByState([])).toEqual({
            passing: 0,
            degraded: 0,
            noData: 0,
            paused: 0,
        });
    });

    it('returns all-zero counts when apps have no syntheticChecks', () => {
        expect(countSyntheticsByState([makeApp(), makeApp()])).toEqual({
            passing: 0,
            degraded: 0,
            noData: 0,
            paused: 0,
        });
    });

    it('counts checks across multiple apps', () => {
        const apps = [
            makeApp({
                syntheticChecks: [makeCheck({ uptime: 99.5 }), makeCheck({ uptime: 95 })],
            }),
            makeApp({
                syntheticChecks: [makeCheck({ status: 'paused' }), makeCheck({ uptime: null })],
            }),
        ];
        expect(countSyntheticsByState(apps)).toEqual({
            passing: 1,
            degraded: 1,
            noData: 1,
            paused: 1,
        });
    });
});

// ---------------------------------------------------------------------------
// collectSynthetics
// ---------------------------------------------------------------------------

describe('collectSynthetics', () => {
    it('returns empty array for empty input', () => {
        expect(collectSynthetics([])).toEqual([]);
    });

    it('maps fields correctly', () => {
        const app = makeApp({
            id: 'app-1',
            name: 'My App',
            syntheticChecks: [
                makeCheck({
                    publicId: 'chk-abc',
                    name: 'Login Flow',
                    type: 'browser',
                    status: 'live',
                    uptime: 99.8,
                }),
            ],
        });
        const rows = collectSynthetics([app]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            publicId: 'chk-abc',
            name: 'Login Flow',
            type: 'browser',
            status: 'live',
            uptime: 99.8,
            appId: 'app-1',
            appName: 'My App',
            state: 'passing',
        });
    });

    it('sorts worst-first: degraded -> noData -> paused -> passing', () => {
        const app = makeApp({
            syntheticChecks: [
                makeCheck({ publicId: 'pass', uptime: 99.9 }),
                makeCheck({ publicId: 'paused', status: 'paused' }),
                makeCheck({ publicId: 'degrade', uptime: 90 }),
                makeCheck({ publicId: 'nodata', uptime: null }),
            ],
        });
        const rows = collectSynthetics([app]);
        expect(rows.map((r) => r.publicId)).toEqual(['degrade', 'nodata', 'paused', 'pass']);
    });

    it('within degraded, sorts by lowest uptime first', () => {
        const app = makeApp({
            syntheticChecks: [
                makeCheck({ publicId: 'a', uptime: 97 }),
                makeCheck({ publicId: 'b', uptime: 90 }),
                makeCheck({ publicId: 'c', uptime: 95 }),
            ],
        });
        const rows = collectSynthetics([app]);
        expect(rows.map((r) => r.publicId)).toEqual(['b', 'c', 'a']);
    });
});
