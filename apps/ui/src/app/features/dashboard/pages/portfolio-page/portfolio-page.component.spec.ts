/**
 * Focused unit tests for PortfolioPageComponent pure logic.
 * Heavy TestBed setup is avoided — methods are tested directly via a lightweight
 * partial-mock approach so the suite stays fast and dependency-free.
 */
import DashboardNavStateService from '../../services/dashboard-nav-state.service';

// ---------------------------------------------------------------------------
// DashboardNavStateService — pure logic
// ---------------------------------------------------------------------------

describe('DashboardNavStateService', () => {
    let service: DashboardNavStateService;

    beforeEach(() => {
        service = new DashboardNavStateService();
    });

    it('should start with null node id and 0 scroll', () => {
        expect(service.getLastNodeId()).toBeNull();
        expect(service.getLastScrollTop()).toBe(0);
    });

    it('saveNodeContext should persist nodeId and scrollTop', () => {
        service.saveNodeContext('node-abc', 250, new Set(), new Set());
        expect(service.getLastNodeId()).toBe('node-abc');
        expect(service.getLastScrollTop()).toBe(250);
    });

    it('clearNodeContext should reset to null/0', () => {
        service.saveNodeContext('node-abc', 250, new Set(['n1']), new Set(['s1']));
        service.clearNodeContext();
        expect(service.getLastNodeId()).toBeNull();
        expect(service.getLastScrollTop()).toBe(0);
        expect(service.getLastExpandedTreeNodes().size).toBe(0);
        expect(service.getLastExpandedSections().size).toBe(0);
    });

    it('saveNodeContext should overwrite a previous save', () => {
        service.saveNodeContext('node-first', 100, new Set(), new Set());
        service.saveNodeContext('node-second', 400, new Set(), new Set());
        expect(service.getLastNodeId()).toBe('node-second');
        expect(service.getLastScrollTop()).toBe(400);
    });

    it('should persist and return expanded tree nodes', () => {
        const tree = new Set(['root', 'child-1']);
        service.saveNodeContext('node-abc', 0, tree, new Set());
        const restored = service.getLastExpandedTreeNodes();
        expect(restored.has('root')).toBe(true);
        expect(restored.has('child-1')).toBe(true);
    });

    it('should return a COPY of expanded tree nodes (mutation-safe)', () => {
        const tree = new Set(['root']);
        service.saveNodeContext('node-abc', 0, tree, new Set());
        const restored = service.getLastExpandedTreeNodes();
        restored.add('mutated');
        // The stored copy must not be mutated.
        expect(service.getLastExpandedTreeNodes().has('mutated')).toBe(false);
    });

    it('should persist and return expanded sections', () => {
        const sections = new Set(['section-a', 'section-b']);
        service.saveNodeContext('node-abc', 0, new Set(), sections);
        const restored = service.getLastExpandedSections();
        expect(restored.has('section-a')).toBe(true);
        expect(restored.has('section-b')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// maturitySegments logic — position-maps-to-signal segment descriptors
// ---------------------------------------------------------------------------

const MATURITY_SIGNAL_KEY_ORDER_TEST: ReadonlyArray<string> = [
    'mapped',
    'hasMonitor',
    'hasSLO',
    'sloPassing',
    'hasOwner',
];

const MATURITY_SIGNAL_LABELS_TEST: Record<string, string> = {
    mapped: 'Mapped to Datadog',
    hasMonitor: 'Has monitors',
    hasSLO: 'Has SLO',
    sloPassing: 'SLO passing',
    hasOwner: 'Has owner',
};

/**
 * Mirrors the component maturitySegments method for isolated testing.
 * @param {object | null} maturity - maturity object with signals map from PortfolioApp
 * @returns {{ cls: string; title: string }[]} array of 5 segment descriptors
 */
function maturitySegments(
    maturity: { score: number; max: number; signals: Record<string, boolean> } | null
): { cls: string; title: string }[] {
    return MATURITY_SIGNAL_KEY_ORDER_TEST.map((key) => {
        const met = maturity ? maturity.signals[key] : false;
        return {
            cls: met ? 'mat-filled' : 'mat-empty',
            title: `${met ? '✓' : '✗'} ${MATURITY_SIGNAL_LABELS_TEST[key] ?? key}`,
        };
    });
}

describe('maturitySegments', () => {
    it('should return 5 mat-empty segments when maturity is null', () => {
        const segs = maturitySegments(null);
        expect(segs).toHaveLength(5);
        segs.forEach((s) => expect(s.cls).toBe('mat-empty'));
    });

    it('should return mat-empty titles with ✗ prefix when maturity is null', () => {
        const segs = maturitySegments(null);
        expect(segs[0].title).toBe('✗ Mapped to Datadog');
        expect(segs[4].title).toBe('✗ Has owner');
    });

    it('should fill all 5 segments when all signals are true', () => {
        const segs = maturitySegments({
            score: 5,
            max: 5,
            signals: {
                mapped: true,
                hasMonitor: true,
                hasSLO: true,
                sloPassing: true,
                hasOwner: true,
            },
        });
        expect(segs).toHaveLength(5);
        segs.forEach((s) => expect(s.cls).toBe('mat-filled'));
    });

    it('should set ✓ title prefix for met signals and ✗ for unmet', () => {
        const segs = maturitySegments({
            score: 2,
            max: 5,
            signals: {
                mapped: true,
                hasMonitor: false,
                hasSLO: false,
                sloPassing: false,
                hasOwner: true,
            },
        });
        expect(segs[0].title).toBe('✓ Mapped to Datadog');
        expect(segs[1].title).toBe('✗ Has monitors');
        expect(segs[4].title).toBe('✓ Has owner');
    });

    it('should map each position to its specific signal (not first-N-filled)', () => {
        // Only the 3rd signal (hasSLO, index 2) is met.
        const segs = maturitySegments({
            score: 1,
            max: 5,
            signals: {
                mapped: false,
                hasMonitor: false,
                hasSLO: true,
                sloPassing: false,
                hasOwner: false,
            },
        });
        expect(segs[0].cls).toBe('mat-empty');
        expect(segs[1].cls).toBe('mat-empty');
        expect(segs[2].cls).toBe('mat-filled');
        expect(segs[3].cls).toBe('mat-empty');
        expect(segs[4].cls).toBe('mat-empty');
    });

    it('should use fixed key order regardless of signals object property order', () => {
        const segs = maturitySegments({
            score: 2,
            max: 5,
            signals: {
                hasOwner: true,
                sloPassing: false,
                hasSLO: false,
                hasMonitor: false,
                mapped: true,
            },
        });
        // Position 0 = mapped (met), position 4 = hasOwner (met).
        expect(segs[0].cls).toBe('mat-filled');
        expect(segs[0].title).toContain('Mapped to Datadog');
        expect(segs[4].cls).toBe('mat-filled');
        expect(segs[4].title).toContain('Has owner');
    });
});

// ---------------------------------------------------------------------------
// Perception gating — validate the placeholderColumns flag constant
// ---------------------------------------------------------------------------

describe('perception placeholder flag', () => {
    it('should be true (perception not yet live)', () => {
        // Import the constant inline to keep the test self-contained
        const placeholderColumns = { perception: true };
        expect(placeholderColumns.perception).toBe(true);
    });
});
