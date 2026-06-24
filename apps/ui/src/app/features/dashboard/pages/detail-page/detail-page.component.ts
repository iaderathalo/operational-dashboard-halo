import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
    DashboardDetailChannelOption,
    DashboardDetailPeople,
    DashboardDetailView,
    DashboardDetailNotifyOption,
    HealthSnapshot,
    RecommendationResult,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import {
    buildActivityFeed,
    buildHealthEvents,
    buildHealthTimeline,
    buildSourceTip,
    cloneCheckedItems,
    DETAIL_TABS,
    DetailTabId,
    HEALTH_STATUS_LABELS,
    ISSUE_TYPES,
    IssueType,
    PERCEPTION_PLACEHOLDER,
    PERCEPTION_STATUS_LABELS,
    perceptionGaugeOffsetFor,
    REC_CONFIDENCE_TONE,
    REC_EFFORT_LABEL,
    REC_SIGNAL_CATEGORY,
    recRingTone,
    shortenSyntheticCheckName,
    statusLabel,
    syntheticCheckTone,
    windowHealthByRange,
} from './detail-page.data';
import { METRIC_DESCRIPTIONS, formatMetricTooltip } from '../../metric-descriptions';
import DashboardDataModeService from '../../services/dashboard-data-mode.service';
import DashboardService from '../../services/dashboard.service';

@Component({
    selector: 'polaris-detail-page',
    templateUrl: './detail-page.component.html',
    styleUrls: ['./detail-page.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule],
})
/**
 * Renders the application detail experience that mirrors the prototype schema.
 */
export default class DetailPageComponent implements OnInit, OnDestroy {
    isLoading = true;

    loadError = '';

    activeTab: DetailTabId = 'overview';

    view!: DashboardDetailView;

    people!: DashboardDetailPeople;

    readonly tabs = DETAIL_TABS.filter((tab) => tab.id !== 'perception' || !PERCEPTION_PLACEHOLDER);

    readonly issueTypes = ISSUE_TYPES;

    readonly healthStatusLabels = HEALTH_STATUS_LABELS;

    readonly perceptionStatusLabels = PERCEPTION_STATUS_LABELS;

    readonly heatmapHours = Array.from({ length: 24 }, (_, hour) => hour);

    activeOverviewRange = '7d';

    activePerceptionRange = '24h';

    healthTimelineLive = false;

    healthTimelineEmpty = false;

    /** Recent Health Events + Recent Activity derive from the real synced series, not seeded (E12-S1). */
    syncedCardsReal = false;

    /** Full Health series from the backend; re-windowed by the active overview range (7-1). */
    private healthSeries: HealthSnapshot[] = [];

    isSev1ModalOpen = false;

    modalStep = 1;

    selectedIssueType: IssueType = 'Availability / Outage';

    sev1Title = '';

    sev1Description = '';

    sev1NotifyOptions: DashboardDetailNotifyOption[] = [];

    sev1ChannelOptions: DashboardDetailChannelOption[] = [];

    expandedIncidents = new Set<string>();

    /** 12-x Recommendations: loaded on demand (Generate), never in ngOnInit. */
    recs?: RecommendationResult;

    recsLoading = false;

    recsError = '';

    recsGenerated = false;

    expandedRecs = new Set<string>();

    toastVisible = false;

    toastMessage = '';

    private currentAppId = '';

    private toastTimeoutHandle?: ReturnType<typeof setTimeout>;

    private modeSubscription?: Subscription;

    /**
     * Creates the detail page component with route and navigation services.
     * @param {object} route Active route used to resolve the application id.
     * @param {object} router Router used for navigation back to the dashboard.
     * @param {object} dashboardService Service used to load detail context from the API.
     * @param dataModeService
     */
    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private dashboardService: DashboardService,
        private dataModeService: DashboardDataModeService
    ) {}

    /**
     * Loads the routed application context and seeds the prototype-derived view model.
     * Also restores the active tab from the ?tab= query param when navigating via deep-link.
     * @returns {void}
     */
    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id') || '';

        if (!id) {
            this.loadError = 'Application detail is unavailable.';
            this.isLoading = false;
            return;
        }

        const tabParam = this.route.snapshot.queryParamMap.get('tab') as DetailTabId | null;
        if (tabParam && this.tabs.some((t) => t.id === tabParam)) {
            this.activeTab = tabParam;
        }

        this.currentAppId = id;
        this.modeSubscription = this.dataModeService.mode$.subscribe(() =>
            this.loadDetail(this.currentAppId)
        );
    }

    /**
     * Clears any pending toast timer when the component is destroyed.
     */
    ngOnDestroy(): void {
        this.modeSubscription?.unsubscribe();

        if (this.toastTimeoutHandle) {
            clearTimeout(this.toastTimeoutHandle);
        }
    }

    /**
     * Switches the visible detail tab and writes the active tab id to the URL as a query param
     * so the current tab survives a page refresh or can be deep-linked.
     * @param {DetailTabId} tabId Tab identifier to activate.
     * @returns {void}
     */
    setTab(tabId: DetailTabId): void {
        this.activeTab = tabId;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { tab: tabId },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }

    /**
     * Updates the selected range for the overview timeline controls.
     * @param {string} range Range label to mark as active.
     */
    setOverviewRange(range: string): void {
        this.activeOverviewRange = range;
        this.renderHealthTimeline();
    }

    /**
     * Updates the selected range for the perception trend controls.
     * @param {string} range Range label to mark as active.
     */
    setPerceptionRange(range: string): void {
        this.activePerceptionRange = range;
    }

    /**
     * Navigates back to the dashboard landing page.
     */
    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    /** Maps a health/perception status code to its UI label (pure helper from data.ts). */
    readonly statusLabel = statusLabel;

    /** Provenance tooltip for the live-vs-placeholder dot on detail cards. */
    readonly sourceTip = buildSourceTip;

    /** 12-x Recommendations: template-bound lookups exposed as field refs (no this). */
    readonly recCategory = REC_SIGNAL_CATEGORY;

    readonly recEffortLabel = REC_EFFORT_LABEL;

    readonly recConfidenceTone = REC_CONFIDENCE_TONE;

    readonly recRingTone = recRingTone;

    /** Provenance tooltip for the Recommendations scorecard (machine-suggested → grey dot). */
    readonly recSourceTip = formatMetricTooltip(METRIC_DESCRIPTIONS.recommendations);

    /** Health Check Breakdown (12-4): readable label + uptime tone for a synthetic check. */
    readonly healthCheckLabel = shortenSyntheticCheckName;

    readonly healthCheckTone = syntheticCheckTone;

    /**
     * Whether the Health Check Breakdown is live synthetic data (real mode) vs the demo
     * sample — drives the source dot colour + tooltip.
     * @returns {boolean} true in real-data mode
     */
    get healthChecksLive(): boolean {
        return this.dataModeService.currentMode === 'real';
    }

    /**
     * Opens the Sev-1 workflow modal and resets it to the first step.
     */
    openSev1Modal(): void {
        this.isSev1ModalOpen = true;
        this.modalStep = 1;
    }

    /**
     * Closes the Sev-1 workflow modal.
     */
    closeSev1Modal(): void {
        this.isSev1ModalOpen = false;
    }

    /**
     * Advances the Sev-1 workflow to the next step.
     */
    nextModalStep(): void {
        if (this.modalStep < 3) {
            this.modalStep += 1;
        }
    }

    /**
     * Returns the Sev-1 workflow to the previous step.
     */
    previousModalStep(): void {
        if (this.modalStep > 1) {
            this.modalStep -= 1;
        }
    }

    /**
     * Stores the selected Sev-1 incident type.
     * @param {string} issueType Selected issue classification.
     */
    selectIssueType(issueType: IssueType): void {
        this.selectedIssueType = issueType;
    }

    /**
     * Expands or collapses an incident card in the incident timeline.
     * @param {string} title Incident title that keys the expanded state.
     */
    toggleIncident(title: string): void {
        if (this.expandedIncidents.has(title)) {
            this.expandedIncidents.delete(title);
            return;
        }

        this.expandedIncidents.add(title);
    }

    /**
     * Returns whether a given incident is currently expanded.
     * @param {string} title Incident title that keys the expanded state.
     * @returns {boolean} True when the incident card is expanded.
     */
    isIncidentExpanded(title: string): boolean {
        return this.expandedIncidents.has(title);
    }

    /**
     * Maturity score for the scorecard header before recommendations are generated.
     * The detail view does not surface maturity, so it falls back to the loaded
     * recommendations' currentScore (0 until first generation).
     * @returns {number} Current maturity score (0–5).
     */
    get maturityScore(): number {
        return this.recs?.currentScore ?? 0;
    }

    /** Number of failing maturity signals = the count of generated actions. */
    get failingCount(): number {
        return this.recs?.actions.length ?? 0;
    }

    /**
     * Loads grounded recommendations on demand (the Generate button). Never called
     * from ngOnInit/loadDetail — the tab stays empty until the user asks for it.
     * @returns {void}
     */
    generateRecommendations(): void {
        this.fetchRecommendations(false);
    }

    /**
     * Re-runs generation, busting the server cache. Prior results stay visible on
     * error so a transient failure never wipes a good answer.
     * @returns {void}
     */
    regenerate(): void {
        this.fetchRecommendations(true);
    }

    /**
     * Shared fetch for generate/regenerate. Preserves any prior `recs` on error.
     * @param {boolean} refresh True to bust the server cache.
     * @returns {void}
     */
    private fetchRecommendations(refresh: boolean): void {
        this.recsLoading = true;
        this.recsError = '';

        this.dashboardService.getRecommendations(this.currentAppId, refresh).subscribe({
            next: (result) => {
                this.recs = result;
                this.recsGenerated = true;
                this.recsError = '';
                this.recsLoading = false;
            },
            error: () => {
                this.recsError = 'Unable to generate recommendations. Try again.';
                this.recsLoading = false;
            },
        });
    }

    /**
     * Expands or collapses a recommendation card's details.
     * @param {string} id Recommendation id that keys the expanded state.
     * @returns {void}
     */
    toggleRec(id: string): void {
        if (this.expandedRecs.has(id)) {
            this.expandedRecs.delete(id);
            return;
        }

        this.expandedRecs.add(id);
    }

    /**
     * Returns whether a given recommendation card is currently expanded.
     * @param {string} id Recommendation id that keys the expanded state.
     * @returns {boolean} True when the card is expanded.
     */
    isRecExpanded(id: string): boolean {
        return this.expandedRecs.has(id);
    }

    /**
     * Completes the Sev-1 workflow and shows a confirmation toast.
     */
    confirmSev1(): void {
        this.closeSev1Modal();
        this.showToast('Sev-1 INC-20260305-003 created successfully. Notifications sent.');
    }

    /**
     * Displays a temporary toast notification.
     * @param {string} message Toast message to display.
     */
    showToast(message: string): void {
        this.toastMessage = message;
        this.toastVisible = true;

        if (this.toastTimeoutHandle) {
            clearTimeout(this.toastTimeoutHandle);
        }

        this.toastTimeoutHandle = setTimeout(() => {
            this.toastVisible = false;
        }, 5000);
    }

    /**
     * Loads the routed application detail context from the dashboard API.
     * @param {string} id Portfolio application id from the route.
     */
    private loadDetail(id: string): void {
        this.isLoading = true;
        this.loadError = '';

        this.dashboardService.getPortfolioAppDetail(id).subscribe({
            next: (detail) => {
                this.view = detail.view;
                this.people = detail.people;
                this.sev1NotifyOptions = cloneCheckedItems(detail.people.sev1Notify);
                this.sev1ChannelOptions = cloneCheckedItems(detail.people.sev1Channels);
                this.updateIncidentDefaults();
                this.isLoading = false;
                this.loadHealthTimeline(id);
            },
            error: () => {
                this.loadError = 'Unable to load application detail.';
                this.isLoading = false;
            },
        });
    }

    /**
     * Overlays the real append-only Health timeline onto the loaded view (FR-3).
     * Demo mode keeps the seeded showcase bars; real mode replaces them with the
     * Datadog-backed series, falling back to an honest empty state when none yet.
     * @param {string} id Portfolio application id from the route.
     */
    private loadHealthTimeline(id: string): void {
        this.healthTimelineLive = false;
        this.healthTimelineEmpty = false;
        this.syncedCardsReal = false;

        if (this.dataModeService.currentMode === 'demo') {
            return;
        }

        this.dashboardService.getHealthHistory(id).subscribe({
            next: (history) => this.applyHealthTimeline(history.points),
            error: () => {
                // Non-critical: leave the existing bars in place if history fails to load.
            },
        });
    }

    /**
     * Applies a fetched Health series to the Health timeline row.
     * @param {HealthSnapshot[]} points Health records for the current application.
     */
    private applyHealthTimeline(points: HealthSnapshot[]): void {
        this.healthSeries = points;
        // E12-S1: the same already-synced series feeds the two synced-data cards.
        this.syncedCardsReal = true;
        this.view.healthEvents = buildHealthEvents(points);
        this.view.activityLog = buildActivityFeed(points);
        this.renderHealthTimeline();
    }

    /**
     * Renders the Health timeline row windowed to the active overview range (24h/7d/30d).
     * Re-runnable on range change without re-fetching (7-1).
     */
    private renderHealthTimeline(): void {
        if (!this.healthSeries.length) {
            // Honest empty state: clear the seeded bars rather than imply false green.
            this.view.healthTimelineBars = [];
            this.view.timelineAxis = [];
            this.healthTimelineLive = false;
            this.healthTimelineEmpty = true;
            return;
        }

        const windowed = windowHealthByRange(this.healthSeries, this.activeOverviewRange);

        if (!windowed.length) {
            // Snapshots exist, but none within the selected window — honest empty for this range.
            this.view.healthTimelineBars = [];
            this.view.timelineAxis = [];
            this.healthTimelineLive = false;
            this.healthTimelineEmpty = true;
            return;
        }

        const { bars, axis } = buildHealthTimeline(windowed);
        this.view.healthTimelineBars = bars;
        this.view.timelineAxis = axis;
        this.healthTimelineLive = true;
        this.healthTimelineEmpty = false;
    }

    /**
     * Refreshes the pre-filled Sev-1 workflow copy after the app context changes.
     */
    private updateIncidentDefaults(): void {
        this.sev1Title = `${this.view.name} — Incident`;
        this.sev1Description = `Users experiencing issues with ${this.view.name}.`;
    }

    /**
     * Counts the selected notification recipients in the Sev-1 workflow.
     * @returns {number} Number of checked recipient options.
     */
    selectedNotifyCount(): number {
        return this.sev1NotifyOptions.filter((option) => option.checked).length;
    }

    /**
     * Counts the selected notification channels in the Sev-1 workflow.
     * @returns {number} Number of checked notification channels.
     */
    selectedChannelCount(): number {
        return this.sev1ChannelOptions.filter((option) => option.checked).length;
    }

    /** SVG stroke-dash offset for the perception gauge (math in data.ts). */
    readonly perceptionGaugeOffset = (): number =>
        perceptionGaugeOffsetFor(this.view.perceptionScore);
}
