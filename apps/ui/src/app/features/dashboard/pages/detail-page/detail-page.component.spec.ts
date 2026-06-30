/**
 * Focused unit tests for DetailPageComponent pure logic.
 * Uses a minimal stub approach to avoid heavy TestBed configuration.
 */
import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import {
    buildDemoRecommendations,
    DETAIL_TABS,
    DetailTabId,
    PERCEPTION_PLACEHOLDER,
    REC_CONFIDENCE_TONE,
    REC_EFFORT_LABEL,
    REC_SIGNAL_CATEGORY,
    recRingTone,
} from './detail-page.data';
import { buildMaturityScoreTooltip, buildMaturitySegments } from '../../maturity.util';
import { METRIC_DESCRIPTIONS, formatMetricTooltip } from '../../metric-descriptions';
import { PortfolioApp } from '../../models/portfolio.model';

// ---------------------------------------------------------------------------
// PERCEPTION_PLACEHOLDER — ensures the flag is exported and set correctly
// ---------------------------------------------------------------------------

describe('PERCEPTION_PLACEHOLDER', () => {
    it('should be a boolean', () => {
        expect(typeof PERCEPTION_PLACEHOLDER).toBe('boolean');
    });

    it('should be false (perception tab re-activated)', () => {
        expect(PERCEPTION_PLACEHOLDER).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// DETAIL_TABS — perception tab filtering
// ---------------------------------------------------------------------------

describe('DETAIL_TABS with PERCEPTION_PLACEHOLDER', () => {
    const visibleTabs = DETAIL_TABS.filter(
        (tab) => tab.id !== 'perception' || !PERCEPTION_PLACEHOLDER
    );

    it('should include the perception tab when PERCEPTION_PLACEHOLDER is false', () => {
        const perceptionTab = visibleTabs.find((t) => t.id === 'perception');
        expect(perceptionTab).toBeDefined();
    });

    it('should still include the overview and health tabs', () => {
        const ids = visibleTabs.map((t) => t.id);
        expect(ids).toContain('overview');
        expect(ids).toContain('health');
    });

    it('should include all tabs when no placeholder filtering applies', () => {
        expect(visibleTabs).toHaveLength(DETAIL_TABS.length);
    });
});

// ---------------------------------------------------------------------------
// buildSourceTip logic — re-implemented to test in isolation
// ---------------------------------------------------------------------------

type DashboardDetailSource = 'datadog' | 'planview' | 'placeholder';

const DETAIL_CARD_METRIC_KEYS: Record<string, string> = {
    'Uptime (30d)': 'uptimeDetail',
    'Error Budget': 'errorBudget',
    // Health tab card titles (13-4)
    'Health Status Timeline': 'healthTimeline',
    'Uptime & Error Budget': 'uptimeBudget',
    'Datadog Monitors': 'monitors',
    // Synced-data cards (overview + health tabs)
    'Recent Activity': 'recentActivity',
    'Recent Health Events': 'recentHealthEvents',
    'Health Check Breakdown': 'healthCheckBreakdown',
};

/**
 * Mirrors the component buildSourceTip function for isolated testing.
 * @param {DashboardDetailSource} [source] - where the card data comes from
 * @param {string} [metricLabel] - the metric label used to look up the description triad
 * @returns {string} human-readable provenance string
 */
function buildSourceTip(source?: DashboardDetailSource, metricLabel?: string): string {
    if (source === 'placeholder') {
        return 'Placeholder — not wired to a live source yet';
    }
    const key = metricLabel ? DETAIL_CARD_METRIC_KEYS[metricLabel] : undefined;
    const staticDesc =
        key && METRIC_DESCRIPTIONS[key as keyof typeof METRIC_DESCRIPTIONS]
            ? `${formatMetricTooltip(METRIC_DESCRIPTIONS[key as keyof typeof METRIC_DESCRIPTIONS])}\n`
            : '';
    if (source === 'datadog') {
        return `${staticDesc}Live · Datadog`;
    }
    if (source === 'planview') {
        return `${staticDesc}Real · from PlanView (not Datadog)`;
    }
    return 'Placeholder — not wired to a live source yet';
}

describe('buildSourceTip', () => {
    it('should return placeholder text when source is "placeholder"', () => {
        expect(buildSourceTip('placeholder')).toBe('Placeholder — not wired to a live source yet');
    });

    it('should return placeholder text when source is undefined', () => {
        expect(buildSourceTip(undefined)).toBe('Placeholder — not wired to a live source yet');
    });

    it('should return "Live · Datadog" for datadog source without metric label', () => {
        expect(buildSourceTip('datadog')).toBe('Live · Datadog');
    });

    it('should return "Real · from PlanView (not Datadog)" for planview source without label', () => {
        expect(buildSourceTip('planview')).toBe('Real · from PlanView (not Datadog)');
    });

    it('should prefix the triad for known metric labels with datadog source', () => {
        const result = buildSourceTip('datadog', 'Uptime (30d)');
        const expectedTriad = formatMetricTooltip(METRIC_DESCRIPTIONS.uptimeDetail);
        expect(result.startsWith(expectedTriad)).toBe(true);
        expect(result).toContain('Live · Datadog');
    });

    it('should prefix the triad for Error Budget with datadog source', () => {
        const result = buildSourceTip('datadog', 'Error Budget');
        const expectedTriad = formatMetricTooltip(METRIC_DESCRIPTIONS.errorBudget);
        expect(result.startsWith(expectedTriad)).toBe(true);
    });

    it('should not prefix triad for unknown metric labels', () => {
        const result = buildSourceTip('datadog', 'Unknown Metric');
        expect(result).toBe('Live · Datadog');
    });

    it('should separate triad from live label with a newline', () => {
        const result = buildSourceTip('datadog', 'Uptime (30d)');
        expect(result).toContain('\n');
    });

    it('should include the metric triad for Health Status Timeline', () => {
        const result = buildSourceTip('datadog', 'Health Status Timeline');
        const expectedTriad = formatMetricTooltip(
            METRIC_DESCRIPTIONS['healthTimeline' as keyof typeof METRIC_DESCRIPTIONS]
        );
        expect(result.startsWith(expectedTriad)).toBe(true);
        expect(result).toContain('Live · Datadog');
    });

    it('should include the metric triad for Recent Activity', () => {
        const result = buildSourceTip('datadog', 'Recent Activity');
        const expectedTriad = formatMetricTooltip(
            METRIC_DESCRIPTIONS['recentActivity' as keyof typeof METRIC_DESCRIPTIONS]
        );
        expect(result.startsWith(expectedTriad)).toBe(true);
        expect(result).toContain('Live · Datadog');
    });

    it('should include the metric triad for Recent Health Events', () => {
        const result = buildSourceTip('datadog', 'Recent Health Events');
        const expectedTriad = formatMetricTooltip(
            METRIC_DESCRIPTIONS['recentHealthEvents' as keyof typeof METRIC_DESCRIPTIONS]
        );
        expect(result.startsWith(expectedTriad)).toBe(true);
        expect(result).toContain('Live · Datadog');
    });

    it('should include the metric triad for Health Check Breakdown', () => {
        const result = buildSourceTip('datadog', 'Health Check Breakdown');
        const expectedTriad = formatMetricTooltip(
            METRIC_DESCRIPTIONS['healthCheckBreakdown' as keyof typeof METRIC_DESCRIPTIONS]
        );
        expect(result.startsWith(expectedTriad)).toBe(true);
        expect(result).toContain('Live · Datadog');
    });

    it('should stay a placeholder tip for synced cards before first sync', () => {
        // When the synced data is not yet real the metric label is ignored.
        expect(buildSourceTip('placeholder', 'Recent Activity')).toBe(
            'Placeholder — not wired to a live source yet'
        );
        expect(buildSourceTip('placeholder', 'Recent Health Events')).toBe(
            'Placeholder — not wired to a live source yet'
        );
    });

    it('should include the metric triad for Uptime & Error Budget', () => {
        const result = buildSourceTip('datadog', 'Uptime & Error Budget');
        const expectedTriad = formatMetricTooltip(
            METRIC_DESCRIPTIONS['uptimeBudget' as keyof typeof METRIC_DESCRIPTIONS]
        );
        expect(result.startsWith(expectedTriad)).toBe(true);
    });

    it('should include the metric triad for Datadog Monitors', () => {
        const result = buildSourceTip('datadog', 'Datadog Monitors');
        const expectedTriad = formatMetricTooltip(
            METRIC_DESCRIPTIONS['monitors' as keyof typeof METRIC_DESCRIPTIONS]
        );
        expect(result.startsWith(expectedTriad)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Tab restore from query param — logic test
// ---------------------------------------------------------------------------

describe('tab restore from ?tab= query param', () => {
    const visibleTabs = DETAIL_TABS.filter(
        (tab) => tab.id !== 'perception' || !PERCEPTION_PLACEHOLDER
    );

    /**
     * Simulates the ngOnInit tab-restore logic.
     * @param {string | null} tabParam - the value of the ?tab= query param
     * @param {string} defaultTab - the default active tab
     * @returns {DetailTabId} the resolved active tab
     */
    function resolveActiveTab(tabParam: string | null, defaultTab: DetailTabId): DetailTabId {
        if (tabParam && visibleTabs.some((t) => t.id === tabParam)) {
            return tabParam as DetailTabId;
        }
        return defaultTab;
    }

    it('should keep the default tab when no query param is present', () => {
        expect(resolveActiveTab(null, 'overview')).toBe('overview');
    });

    it('should restore the tab from a valid query param', () => {
        expect(resolveActiveTab('health', 'overview')).toBe('health');
    });

    it('should ignore an invalid tab param and keep the default', () => {
        expect(resolveActiveTab('nonexistent-tab', 'overview')).toBe('overview');
    });

    it('should restore the perception tab param when PERCEPTION_PLACEHOLDER is false', () => {
        // 'perception' is part of visibleTabs again (tab re-activated), so it is a valid restore target
        expect(resolveActiveTab('perception', 'overview')).toBe('perception');
    });

    it('should restore the contacts tab when navigated via deep-link', () => {
        expect(resolveActiveTab('contacts', 'overview')).toBe('contacts');
    });
});

// ---------------------------------------------------------------------------
// 12-x Recommendations — tab registration + pure display helpers
// ---------------------------------------------------------------------------

describe('Recommendations tab registration', () => {
    it('should register the recommendations tab', () => {
        expect(DETAIL_TABS.some((t) => t.id === 'recommendations')).toBe(true);
    });

    it('should place recommendations after incidents and before contacts', () => {
        const ids = DETAIL_TABS.map((t) => t.id);
        expect(ids.indexOf('recommendations')).toBeGreaterThan(ids.indexOf('incidents'));
        expect(ids.indexOf('recommendations')).toBeLessThan(ids.indexOf('contacts'));
    });

    it('should remain visible (not perception-gated) in the component tab filter', () => {
        const visible = DETAIL_TABS.filter(
            (tab) => tab.id !== 'perception' || !PERCEPTION_PLACEHOLDER
        );
        expect(visible.some((t) => t.id === 'recommendations')).toBe(true);
    });
});

describe('recRingTone', () => {
    it('should return good at full maturity (5/5)', () => {
        expect(recRingTone(5)).toBe('good');
    });

    it('should return warn for a partially mature score (3)', () => {
        expect(recRingTone(3)).toBe('warn');
    });

    it('should return risk for a low score (2)', () => {
        expect(recRingTone(2)).toBe('risk');
    });
});

describe('recommendation display lookup maps', () => {
    it('should map each maturity signal to a display category', () => {
        expect(REC_SIGNAL_CATEGORY.hasSLO).toBe('Observability');
        expect(REC_SIGNAL_CATEGORY.hasOwner).toBe('Ownership');
        expect(REC_SIGNAL_CATEGORY.mapped).toBe('Catalog');
    });

    it('should map effort to a compact label', () => {
        expect(REC_EFFORT_LABEL.low).toBe('Low');
        expect(REC_EFFORT_LABEL.medium).toBe('Med');
        expect(REC_EFFORT_LABEL.high).toBe('High');
    });

    it('should map confidence to a status-pill tone', () => {
        expect(REC_CONFIDENCE_TONE.high).toBe('green');
        expect(REC_CONFIDENCE_TONE.medium).toBe('amber');
        expect(REC_CONFIDENCE_TONE.low).toBe('grey');
    });
});

describe('buildDemoRecommendations', () => {
    const baseApp: PortfolioApp = {
        id: 'demo-1',
        name: 'Demo App',
        health: 'amber',
        perception: 'undefined',
        uptime: 93.99,
        slaTarget: null,
        lastSyncStatus: 'ok',
        lastSyncAt: '2026-06-24T03:39:31.290Z',
        users: 0,
        totalInternalUsers: 0,
        totalExternalUsers: 0,
        activeUsers: null,
        incidents: 0,
        lastIncident: 'N/A',
        maturity: {
            score: 3,
            max: 5,
            signals: {
                mapped: true,
                hasMonitor: true,
                hasSLO: false,
                sloPassing: false,
                hasOwner: true,
            },
        },
    };

    it('should produce one ranked action per failing signal, hasSLO before sloPassing', () => {
        const result = buildDemoRecommendations(baseApp);
        expect(result.actions.map((a) => a.signal)).toEqual(['hasSLO', 'sloPassing']);
        expect(result.actions.every((a) => a.expectedMaturityDelta === 1)).toBe(true);
    });

    it('should ground evidence on the real uptime value and never invent a target', () => {
        const result = buildDemoRecommendations(baseApp);
        const slo = result.actions.find((a) => a.signal === 'hasSLO');
        expect(slo?.evidence).toContain('93.99');
        expect(slo?.evidence).toContain('slaTarget=not available');
    });

    it('should report live freshness when the last sync is ok and target 5', () => {
        const result = buildDemoRecommendations(baseApp);
        expect(result.freshness).toBe('live');
        expect(result.targetScore).toBe(5);
        expect(result.currentScore).toBe(3);
    });

    it('should report stale freshness when the last sync is not ok', () => {
        const result = buildDemoRecommendations({ ...baseApp, lastSyncStatus: 'error' });
        expect(result.freshness).toBe('stale');
    });

    it('should return no actions and a celebratory note at 5/5', () => {
        const fullyMature: PortfolioApp = {
            ...baseApp,
            maturity: {
                score: 5,
                max: 5,
                signals: {
                    mapped: true,
                    hasMonitor: true,
                    hasSLO: true,
                    sloPassing: true,
                    hasOwner: true,
                },
            },
        };
        const result = buildDemoRecommendations(fullyMature);
        expect(result.actions).toEqual([]);
        expect(result.notes).toContain('Fully mature');
    });
});

// ---------------------------------------------------------------------------
// df-1: maturity.util — buildMaturityScoreTooltip + buildMaturitySegments
// ---------------------------------------------------------------------------

describe('buildMaturityScoreTooltip', () => {
    it('returns a scored header when maturity is supplied', () => {
        const tip = buildMaturityScoreTooltip({ score: 3, max: 5 });
        expect(tip).toContain('Maturity 3/5');
        expect(tip).toContain('1 point per signal met');
        expect(tip).toContain('Datadog + PlanView');
    });

    it('returns a not-scored header when maturity is null', () => {
        const tip = buildMaturityScoreTooltip(null);
        expect(tip).toContain('not scored yet');
    });

    it('returns a not-scored header when maturity is undefined', () => {
        const tip = buildMaturityScoreTooltip(undefined);
        expect(tip).toContain('not scored yet');
    });
});

describe('buildMaturitySegments', () => {
    it('returns 5 segments, filled when the signal is true', () => {
        const segs = buildMaturitySegments({
            mapped: true,
            hasMonitor: false,
            hasSLO: true,
            sloPassing: false,
            hasOwner: true,
        });
        expect(segs).toHaveLength(5);
        expect(segs[0].cls).toBe('mat-filled'); // mapped
        expect(segs[1].cls).toBe('mat-empty'); // hasMonitor
        expect(segs[2].cls).toBe('mat-filled'); // hasSLO
        expect(segs[3].cls).toBe('mat-empty'); // sloPassing
        expect(segs[4].cls).toBe('mat-filled'); // hasOwner
    });

    it('returns 5 empty segments when signals is null', () => {
        const segs = buildMaturitySegments(null);
        expect(segs.every((s) => s.cls === 'mat-empty')).toBe(true);
    });

    it('includes a check/cross prefix in each tip', () => {
        const segs = buildMaturitySegments({
            mapped: true,
            hasMonitor: false,
            hasSLO: false,
            sloPassing: false,
            hasOwner: false,
        });
        expect(segs[0].tip).toMatch(/^✓/);
        expect(segs[1].tip).toMatch(/^✗/);
    });
});

// ---------------------------------------------------------------------------
// df-1: maturityScore getter — reads view.maturity.score on load (no recs)
// Tests the logic inline since the getter is pure.
// ---------------------------------------------------------------------------

describe('maturityScore getter logic', () => {
    /**
     * Mirrors the getter: recs?.currentScore ?? view?.maturity?.score ?? 0
     * @param recs
     * @param recs.currentScore
     * @param maturityScore
     */
    function simulateGetter(recs?: { currentScore: number }, maturityScore?: number): number {
        const view =
            maturityScore !== undefined
                ? { maturity: { score: maturityScore, max: 5, signals: {} } }
                : undefined;
        return recs?.currentScore ?? view?.maturity?.score ?? 0;
    }

    it('reads view.maturity.score when recs is not loaded yet', () => {
        expect(simulateGetter(undefined, 3)).toBe(3);
    });

    it('prefers recs.currentScore over view.maturity.score when recs are present', () => {
        expect(simulateGetter({ currentScore: 4 }, 3)).toBe(4);
    });

    it('returns 0 when neither recs nor view.maturity is available', () => {
        expect(simulateGetter(undefined, undefined)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// df-5: isTimelineBarDrillable + onTimelineBarClick logic
// Tested inline (no TestBed) since the logic is pure component state.
// ---------------------------------------------------------------------------

type DashboardDetailTimelineTone = 'g' | 'a' | 'r';

/** Minimal component state stub for df-5 tests. */
interface DrillState {
    healthTimelineSnapshots: HealthSnapshot[];
    selectedTimelinePoint: HealthSnapshot | null;
    bars: DashboardDetailTimelineTone[];
}

/**
 * Mirrors isTimelineBarDrillable logic: bar i is drillable when a snapshot
 * exists at that index AND the tone is amber or red.
 * @param state
 * @param i
 */
function isTimelineBarDrillable(state: DrillState, i: number): boolean {
    const snap = state.healthTimelineSnapshots[i];
    if (!snap) {
        return false;
    }
    const tone = state.bars[i];
    return tone === 'a' || tone === 'r';
}

/**
 * Mirrors onTimelineBarClick logic: toggles selectedTimelinePoint.
 * @param state
 * @param i
 */
function onTimelineBarClick(state: DrillState, i: number): void {
    if (!isTimelineBarDrillable(state, i)) {
        return;
    }
    const snap = state.healthTimelineSnapshots[i];
    // eslint-disable-next-line no-param-reassign
    state.selectedTimelinePoint = state.selectedTimelinePoint === snap ? null : snap;
}

const makeSnap = (status: HealthSnapshot['status']): HealthSnapshot => ({
    applicationId: 'a1',
    status,
    uptimePct: null,
    datadogMapped: true,
    monitorCount: 2,
    resolutionPath: 'primary',
    recordedAt: '2026-06-29T10:00:00.000Z',
});

describe('isTimelineBarDrillable (df-5)', () => {
    it('returns false when healthTimelineSnapshots is empty (demo mode)', () => {
        const state: DrillState = {
            healthTimelineSnapshots: [],
            selectedTimelinePoint: null,
            bars: ['a', 'r', 'g'],
        };
        expect(isTimelineBarDrillable(state, 0)).toBe(false);
        expect(isTimelineBarDrillable(state, 1)).toBe(false);
    });

    it('returns false for a green bar even when a snapshot exists', () => {
        const snap = makeSnap('GREEN');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: null,
            bars: ['g'],
        };
        expect(isTimelineBarDrillable(state, 0)).toBe(false);
    });

    it('returns true for an amber bar with a backing snapshot', () => {
        const snap = makeSnap('AMBER');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: null,
            bars: ['a'],
        };
        expect(isTimelineBarDrillable(state, 0)).toBe(true);
    });

    it('returns true for a red bar with a backing snapshot', () => {
        const snap = makeSnap('RED');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: null,
            bars: ['r'],
        };
        expect(isTimelineBarDrillable(state, 0)).toBe(true);
    });

    it('returns false for an out-of-bounds index', () => {
        const snap = makeSnap('AMBER');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: null,
            bars: ['a'],
        };
        expect(isTimelineBarDrillable(state, 5)).toBe(false);
    });
});

describe('onTimelineBarClick (df-5)', () => {
    it('selects the snapshot on first click of an amber bar', () => {
        const snap = makeSnap('AMBER');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: null,
            bars: ['a'],
        };
        onTimelineBarClick(state, 0);
        expect(state.selectedTimelinePoint).toBe(snap);
    });

    it('deselects (toggles off) when the same bar is clicked again', () => {
        const snap = makeSnap('RED');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: snap,
            bars: ['r'],
        };
        onTimelineBarClick(state, 0);
        expect(state.selectedTimelinePoint).toBeNull();
    });

    it('switches selection to a different bar', () => {
        const snapA = makeSnap('AMBER');
        const snapR = makeSnap('RED');
        const state: DrillState = {
            healthTimelineSnapshots: [snapA, snapR],
            selectedTimelinePoint: snapA,
            bars: ['a', 'r'],
        };
        onTimelineBarClick(state, 1);
        expect(state.selectedTimelinePoint).toBe(snapR);
    });

    it('does nothing on a green bar (not drillable)', () => {
        const snap = makeSnap('GREEN');
        const state: DrillState = {
            healthTimelineSnapshots: [snap],
            selectedTimelinePoint: null,
            bars: ['g'],
        };
        onTimelineBarClick(state, 0);
        expect(state.selectedTimelinePoint).toBeNull();
    });

    it('does nothing when healthTimelineSnapshots is empty (demo mode)', () => {
        const state: DrillState = {
            healthTimelineSnapshots: [],
            selectedTimelinePoint: null,
            bars: ['a'],
        };
        onTimelineBarClick(state, 0);
        expect(state.selectedTimelinePoint).toBeNull();
    });
});
