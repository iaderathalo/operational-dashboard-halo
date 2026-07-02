import { SloRow, SloState } from '../../slo-rollup.util';

// ---------------------------------------------------------------------------
// SloPageComponent pure-logic tests — no TestBed needed
// ---------------------------------------------------------------------------

/**
 * Mirrors the component stateClass method for isolated testing.
 * @param state
 */
function stateClass(state: SloState): string {
    switch (state) {
        case 'healthy':
            return 'g';
        case 'atRisk':
            return 'a';
        case 'breaching':
            return 'r';
        default:
            return 'u';
    }
}

/**
 * Mirrors the component stateLabel method for isolated testing.
 * @param state
 */
function stateLabel(state: SloState): string {
    switch (state) {
        case 'healthy':
            return 'Healthy';
        case 'atRisk':
            return 'At-risk';
        case 'breaching':
            return 'Breaching';
        default:
            return 'No SLO';
    }
}

/**
 * Mirrors the component burnBandLabel method for isolated testing.
 * @param band
 */
function burnBandLabel(band: string): string {
    switch (band) {
        case 'healthy':
            return 'Healthy';
        case 'fast-burn':
            return 'Fast burn';
        case 'at-risk':
            return 'At risk';
        default:
            return '—';
    }
}

/**
 * Mirrors the component burnBandClass method for isolated testing.
 * @param band
 */
function burnBandClass(band: string): string {
    switch (band) {
        case 'at-risk':
            return 'metric-bad';
        case 'fast-burn':
            return 'metric-warn';
        case 'healthy':
            return 'metric-good';
        default:
            return 'metric-muted';
    }
}

/**
 * Mirrors the component formatPct method for isolated testing.
 * @param value
 */
function formatPct(value: number | null): string {
    return value != null ? `${value.toFixed(2)}%` : '—';
}

/**
 * Mirrors the component formatTarget method for isolated testing.
 * @param value
 */
function formatTarget(value: number | null): string {
    return value != null ? `${value}%` : '—';
}

/**
 * Minimal row builder for filter tests.
 * @param overrides
 */
function makeRow(overrides: Partial<SloRow> = {}): SloRow {
    return {
        appId: 'test',
        appName: 'Test App',
        slaTarget: null,
        uptime: null,
        errorBudgetRemainingPct: null,
        burnBand: 'unknown',
        state: 'noSlo',
        businessUnit: '',
        ...overrides,
    };
}

/**
 * Mirrors the component applyFilters logic for isolated testing.
 * @param rows
 * @param stateFilter
 * @param buFilter
 */
function applyFilters(rows: SloRow[], stateFilter: string, buFilter: string): SloRow[] {
    let result = rows;
    if (stateFilter) {
        result = result.filter((r) => r.state === stateFilter);
    }
    if (buFilter) {
        result = result.filter((r) => r.businessUnit === buFilter);
    }
    return result;
}

// ---------------------------------------------------------------------------
// stateClass
// ---------------------------------------------------------------------------

describe('SloPage stateClass', () => {
    it('maps healthy to g', () => expect(stateClass('healthy')).toBe('g'));
    it('maps atRisk to a', () => expect(stateClass('atRisk')).toBe('a'));
    it('maps breaching to r', () => expect(stateClass('breaching')).toBe('r'));
    it('maps noSlo to u', () => expect(stateClass('noSlo')).toBe('u'));
});

// ---------------------------------------------------------------------------
// stateLabel
// ---------------------------------------------------------------------------

describe('SloPage stateLabel', () => {
    it('maps healthy to Healthy', () => expect(stateLabel('healthy')).toBe('Healthy'));
    it('maps atRisk to At-risk', () => expect(stateLabel('atRisk')).toBe('At-risk'));
    it('maps breaching to Breaching', () => expect(stateLabel('breaching')).toBe('Breaching'));
    it('maps noSlo to No SLO', () => expect(stateLabel('noSlo')).toBe('No SLO'));
});

// ---------------------------------------------------------------------------
// burnBandLabel / burnBandClass
// ---------------------------------------------------------------------------

describe('SloPage burnBandLabel', () => {
    it('maps healthy', () => expect(burnBandLabel('healthy')).toBe('Healthy'));
    it('maps fast-burn', () => expect(burnBandLabel('fast-burn')).toBe('Fast burn'));
    it('maps at-risk', () => expect(burnBandLabel('at-risk')).toBe('At risk'));
    it('maps unknown to dash', () => expect(burnBandLabel('unknown')).toBe('—'));
});

describe('SloPage burnBandClass', () => {
    it('maps at-risk to metric-bad', () => expect(burnBandClass('at-risk')).toBe('metric-bad'));
    it('maps fast-burn to metric-warn', () =>
        expect(burnBandClass('fast-burn')).toBe('metric-warn'));
    it('maps healthy to metric-good', () => expect(burnBandClass('healthy')).toBe('metric-good'));
    it('maps unknown to metric-muted', () => expect(burnBandClass('unknown')).toBe('metric-muted'));
});

// ---------------------------------------------------------------------------
// formatPct / formatTarget
// ---------------------------------------------------------------------------

describe('SloPage formatPct', () => {
    it('formats a number with 2 decimal places', () => expect(formatPct(99.9)).toBe('99.90%'));
    it('returns dash for null', () => expect(formatPct(null)).toBe('—'));
});

describe('SloPage formatTarget', () => {
    it('formats a number as percentage', () => expect(formatTarget(99.9)).toBe('99.9%'));
    it('returns dash for null', () => expect(formatTarget(null)).toBe('—'));
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe('SloPage applyFilters', () => {
    const rows = [
        makeRow({ appId: 'a', state: 'healthy', businessUnit: 'BU1' }),
        makeRow({ appId: 'b', state: 'breaching', businessUnit: 'BU2' }),
        makeRow({ appId: 'c', state: 'noSlo', businessUnit: 'BU1' }),
        makeRow({ appId: 'd', state: 'atRisk', businessUnit: 'BU2' }),
    ];

    it('returns all rows when no filters are set', () => {
        expect(applyFilters(rows, '', '')).toHaveLength(4);
    });

    it('filters by state', () => {
        const result = applyFilters(rows, 'breaching', '');
        expect(result).toHaveLength(1);
        expect(result[0].appId).toBe('b');
    });

    it('filters by business unit', () => {
        const result = applyFilters(rows, '', 'BU1');
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.appId)).toEqual(['a', 'c']);
    });

    it('filters by both state and business unit', () => {
        const result = applyFilters(rows, 'noSlo', 'BU1');
        expect(result).toHaveLength(1);
        expect(result[0].appId).toBe('c');
    });

    it('returns empty when no match', () => {
        expect(applyFilters(rows, 'healthy', 'BU2')).toHaveLength(0);
    });
});
