/**
 * Focused unit tests for DetailPageComponent pure logic.
 * Uses a minimal stub approach to avoid heavy TestBed configuration.
 */
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
import { METRIC_DESCRIPTIONS, formatMetricTooltip } from '../../metric-descriptions';
import { PortfolioApp } from '../../models/portfolio.model';

// ---------------------------------------------------------------------------
// PERCEPTION_PLACEHOLDER — ensures the flag is exported and set correctly
// ---------------------------------------------------------------------------

describe('PERCEPTION_PLACEHOLDER', () => {
    it('should be a boolean', () => {
        expect(typeof PERCEPTION_PLACEHOLDER).toBe('boolean');
    });

    it('should be true (perception not yet live)', () => {
        expect(PERCEPTION_PLACEHOLDER).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// DETAIL_TABS — perception tab filtering
// ---------------------------------------------------------------------------

describe('DETAIL_TABS with PERCEPTION_PLACEHOLDER', () => {
    const visibleTabs = DETAIL_TABS.filter(
        (tab) => tab.id !== 'perception' || !PERCEPTION_PLACEHOLDER
    );

    it('should exclude the perception tab when PERCEPTION_PLACEHOLDER is true', () => {
        const perceptionTab = visibleTabs.find((t) => t.id === 'perception');
        expect(perceptionTab).toBeUndefined();
    });

    it('should still include the overview and health tabs', () => {
        const ids = visibleTabs.map((t) => t.id);
        expect(ids).toContain('overview');
        expect(ids).toContain('health');
    });

    it('should have fewer tabs than the full DETAIL_TABS array', () => {
        expect(visibleTabs.length).toBeLessThan(DETAIL_TABS.length);
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

    it('should ignore the perception tab param when PERCEPTION_PLACEHOLDER is true', () => {
        // 'perception' is filtered out of visibleTabs, so it is invalid
        expect(resolveActiveTab('perception', 'overview')).toBe('overview');
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
