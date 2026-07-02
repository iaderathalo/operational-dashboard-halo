import { PortfolioApp } from './models/portfolio.model';
import {
    AT_RISK_BUDGET_THRESHOLD,
    classifySloState,
    collectSloApps,
    countSloByState,
} from './slo-rollup.util';

/**
 * Minimal PortfolioApp builder for SLO rollup tests.
 * @param overrides - fields to override on the base app
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

// ---------------------------------------------------------------------------
// AT_RISK_BUDGET_THRESHOLD constant
// ---------------------------------------------------------------------------

describe('AT_RISK_BUDGET_THRESHOLD', () => {
    it('should be 25', () => {
        expect(AT_RISK_BUDGET_THRESHOLD).toBe(25);
    });
});

// ---------------------------------------------------------------------------
// classifySloState
// ---------------------------------------------------------------------------

describe('classifySloState', () => {
    it('returns noSlo when slaTarget is null', () => {
        expect(classifySloState(makeApp({ slaTarget: null, errorBudgetRemainingPct: 50 }))).toBe(
            'noSlo'
        );
    });

    it('returns noSlo when slaTarget is undefined', () => {
        expect(classifySloState(makeApp({ errorBudgetRemainingPct: 50 }))).toBe('noSlo');
    });

    it('returns noSlo when errorBudgetRemainingPct is null', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: null }))).toBe(
            'noSlo'
        );
    });

    it('returns noSlo when errorBudgetRemainingPct is undefined', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9 }))).toBe('noSlo');
    });

    it('returns noSlo when both slaTarget and errorBudgetRemainingPct are null', () => {
        expect(classifySloState(makeApp({ slaTarget: null, errorBudgetRemainingPct: null }))).toBe(
            'noSlo'
        );
    });

    it('returns breaching when errorBudgetRemainingPct is 0', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 0 }))).toBe(
            'breaching'
        );
    });

    it('returns breaching when errorBudgetRemainingPct is negative', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: -10 }))).toBe(
            'breaching'
        );
    });

    it('returns atRisk when errorBudgetRemainingPct is between 0 and 25 (exclusive)', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 10 }))).toBe(
            'atRisk'
        );
    });

    it('returns atRisk when errorBudgetRemainingPct is 24.99', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 24.99 }))).toBe(
            'atRisk'
        );
    });

    it('returns healthy when errorBudgetRemainingPct is exactly 25', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 25 }))).toBe(
            'healthy'
        );
    });

    it('returns healthy when errorBudgetRemainingPct is above 25', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 80 }))).toBe(
            'healthy'
        );
    });

    it('returns healthy when errorBudgetRemainingPct is 100', () => {
        expect(classifySloState(makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 100 }))).toBe(
            'healthy'
        );
    });
});

// ---------------------------------------------------------------------------
// countSloByState
// ---------------------------------------------------------------------------

describe('countSloByState', () => {
    it('returns all-zero counts for an empty apps list', () => {
        expect(countSloByState([])).toEqual({ healthy: 0, atRisk: 0, breaching: 0, noSlo: 0 });
    });

    it('returns all noSlo when apps have no SLO data', () => {
        expect(countSloByState([makeApp(), makeApp()])).toEqual({
            healthy: 0,
            atRisk: 0,
            breaching: 0,
            noSlo: 2,
        });
    });

    it('counts a healthy app', () => {
        const app = makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 50 });
        expect(countSloByState([app])).toEqual({ healthy: 1, atRisk: 0, breaching: 0, noSlo: 0 });
    });

    it('counts an at-risk app', () => {
        const app = makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 10 });
        expect(countSloByState([app])).toEqual({ healthy: 0, atRisk: 1, breaching: 0, noSlo: 0 });
    });

    it('counts a breaching app', () => {
        const app = makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 0 });
        expect(countSloByState([app])).toEqual({ healthy: 0, atRisk: 0, breaching: 1, noSlo: 0 });
    });

    it('sums across multiple apps', () => {
        const apps = [
            makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 80 }),
            makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 10 }),
            makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: -5 }),
            makeApp({}),
        ];
        expect(countSloByState(apps)).toEqual({ healthy: 1, atRisk: 1, breaching: 1, noSlo: 1 });
    });
});

// ---------------------------------------------------------------------------
// collectSloApps
// ---------------------------------------------------------------------------

describe('collectSloApps', () => {
    it('returns empty array for empty input', () => {
        expect(collectSloApps([])).toEqual([]);
    });

    it('maps fields correctly', () => {
        const app = makeApp({
            id: 'app-1',
            name: 'My App',
            slaTarget: 99.9,
            uptime: 99.85,
            errorBudgetRemainingPct: 50,
            burnRate: { rate: 0.5, band: 'healthy' },
        });
        const rows = collectSloApps([app]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({
            appId: 'app-1',
            appName: 'My App',
            slaTarget: 99.9,
            uptime: 99.85,
            errorBudgetRemainingPct: 50,
            burnBand: 'healthy',
            state: 'healthy',
            businessUnit: '',
        });
    });

    it('sorts worst-first: breaching before at-risk before healthy before noSlo', () => {
        const apps = [
            makeApp({ id: 'healthy', slaTarget: 99.9, errorBudgetRemainingPct: 80 }),
            makeApp({ id: 'noSlo' }),
            makeApp({ id: 'breaching', slaTarget: 99.9, errorBudgetRemainingPct: -5 }),
            makeApp({ id: 'atRisk', slaTarget: 99.9, errorBudgetRemainingPct: 10 }),
        ];
        const rows = collectSloApps(apps);
        expect(rows.map((r) => r.appId)).toEqual(['breaching', 'atRisk', 'healthy', 'noSlo']);
    });

    it('within the same state, sorts by error budget ascending (lowest first)', () => {
        const apps = [
            makeApp({ id: 'a', slaTarget: 99.9, errorBudgetRemainingPct: 15 }),
            makeApp({ id: 'b', slaTarget: 99.9, errorBudgetRemainingPct: 5 }),
            makeApp({ id: 'c', slaTarget: 99.9, errorBudgetRemainingPct: 20 }),
        ];
        const rows = collectSloApps(apps);
        expect(rows.map((r) => r.appId)).toEqual(['b', 'a', 'c']);
    });

    it('treats null errorBudgetRemainingPct as Infinity for sorting (noSlo last)', () => {
        const apps = [
            makeApp({ id: 'noSlo1' }),
            makeApp({ id: 'noSlo2', slaTarget: null }),
            makeApp({ id: 'healthy', slaTarget: 99.9, errorBudgetRemainingPct: 80 }),
        ];
        const rows = collectSloApps(apps);
        expect(rows[0].appId).toBe('healthy');
        expect(rows[1].state).toBe('noSlo');
        expect(rows[2].state).toBe('noSlo');
    });

    it('defaults burnBand to unknown when burnRate is undefined', () => {
        const app = makeApp({ slaTarget: 99.9, errorBudgetRemainingPct: 50 });
        const rows = collectSloApps([app]);
        expect(rows[0].burnBand).toBe('unknown');
    });
});
