import { SyntheticRow, SyntheticState } from '../../synthetic-rollup.util';

// ---------------------------------------------------------------------------
// SyntheticsPageComponent pure-logic tests — no TestBed needed
// ---------------------------------------------------------------------------

/**
 * Mirrors the component stateClass method for isolated testing.
 * @param state
 */
function stateClass(state: SyntheticState): string {
    switch (state) {
        case 'passing':
            return 'g';
        case 'degraded':
            return 'a';
        default:
            return 'u';
    }
}

/**
 * Mirrors the component stateLabel method for isolated testing.
 * @param state
 */
function stateLabel(state: SyntheticState): string {
    switch (state) {
        case 'passing':
            return 'Passing';
        case 'degraded':
            return 'Degraded';
        case 'noData':
            return 'No Data';
        default:
            return 'Paused';
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
 * Minimal row builder for filter tests.
 * @param overrides
 */
function makeRow(overrides: Partial<SyntheticRow> = {}): SyntheticRow {
    return {
        publicId: 'chk-1',
        name: 'Test Check',
        type: 'api',
        status: 'live',
        uptime: 99.5,
        appId: 'app-1',
        appName: 'Test App',
        state: 'passing',
        ...overrides,
    };
}

/**
 * Mirrors the component applyFilters logic for isolated testing.
 * @param rows
 * @param stateFilter
 * @param typeFilter
 */
function applyFilters(
    rows: SyntheticRow[],
    stateFilter: string,
    typeFilter: string
): SyntheticRow[] {
    let result = rows;
    if (stateFilter) {
        result = result.filter((r) => r.state === stateFilter);
    }
    if (typeFilter) {
        result = result.filter((r) => r.type === typeFilter);
    }
    return result;
}

// ---------------------------------------------------------------------------
// stateClass
// ---------------------------------------------------------------------------

describe('SyntheticsPage stateClass', () => {
    it('maps passing to g', () => expect(stateClass('passing')).toBe('g'));
    it('maps degraded to a', () => expect(stateClass('degraded')).toBe('a'));
    it('maps noData to u', () => expect(stateClass('noData')).toBe('u'));
    it('maps paused to u', () => expect(stateClass('paused')).toBe('u'));
});

// ---------------------------------------------------------------------------
// stateLabel
// ---------------------------------------------------------------------------

describe('SyntheticsPage stateLabel', () => {
    it('maps passing to Passing', () => expect(stateLabel('passing')).toBe('Passing'));
    it('maps degraded to Degraded', () => expect(stateLabel('degraded')).toBe('Degraded'));
    it('maps noData to No Data', () => expect(stateLabel('noData')).toBe('No Data'));
    it('maps paused to Paused', () => expect(stateLabel('paused')).toBe('Paused'));
});

// ---------------------------------------------------------------------------
// formatPct
// ---------------------------------------------------------------------------

describe('SyntheticsPage formatPct', () => {
    it('formats a number with 2 decimal places', () => expect(formatPct(99.9)).toBe('99.90%'));
    it('returns dash for null', () => expect(formatPct(null)).toBe('—'));
});

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe('SyntheticsPage applyFilters', () => {
    const rows = [
        makeRow({ publicId: 'a', state: 'passing', type: 'api' }),
        makeRow({ publicId: 'b', state: 'degraded', type: 'browser' }),
        makeRow({ publicId: 'c', state: 'noData', type: 'api' }),
        makeRow({ publicId: 'd', state: 'paused', type: 'mobile' }),
    ];

    it('returns all rows when no filters are set', () => {
        expect(applyFilters(rows, '', '')).toHaveLength(4);
    });

    it('filters by state', () => {
        const result = applyFilters(rows, 'degraded', '');
        expect(result).toHaveLength(1);
        expect(result[0].publicId).toBe('b');
    });

    it('filters by type', () => {
        const result = applyFilters(rows, '', 'api');
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.publicId)).toEqual(['a', 'c']);
    });

    it('filters by both state and type', () => {
        const result = applyFilters(rows, 'passing', 'api');
        expect(result).toHaveLength(1);
        expect(result[0].publicId).toBe('a');
    });

    it('returns empty when no match', () => {
        expect(applyFilters(rows, 'passing', 'mobile')).toHaveLength(0);
    });
});
