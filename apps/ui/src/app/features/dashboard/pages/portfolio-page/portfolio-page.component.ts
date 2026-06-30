/* eslint-disable max-lines */
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';

import { buildMaturitySegments, buildMaturityScoreTooltip } from '../../maturity.util';
import { METRIC_DESCRIPTIONS, formatMetricTooltip } from '../../metric-descriptions';
import {
    PortfolioNode,
    PortfolioApp,
    PortfolioRollup,
    StatusCounts,
} from '../../models/portfolio.model';
import DashboardDataModeService from '../../services/dashboard-data-mode.service';
import DashboardNavStateService from '../../services/dashboard-nav-state.service';
import DashboardScopeService from '../../services/dashboard-scope.service';
import DashboardService from '../../services/dashboard.service';

/**
 *
 * @param lastSyncAt
 */
function syncSuffix(lastSyncAt?: string | null): string {
    if (!lastSyncAt) {
        return '';
    }

    const then = new Date(lastSyncAt).getTime();
    if (Number.isNaN(then)) {
        return '';
    }

    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 1) {
        return ' · synced <1 min ago';
    }
    if (minutes < 60) {
        return ` · synced ${minutes} min ago`;
    }

    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return ` · synced ${hours} h ago`;
    }

    return ` · synced ${Math.round(hours / 24)} d ago`;
}

/**
 * Builds the provenance tooltip for the Health column, including the metric description triad.
 * @param {PortfolioApp} app - portfolio application
 * @returns {string} human-readable provenance for a native tooltip
 */
function buildHealthProvenance(app: PortfolioApp): string {
    const staticDesc = formatMetricTooltip(METRIC_DESCRIPTIONS.health);
    if (app.lastSyncStatus === 'error') {
        return `${staticDesc}\nStale — last Datadog sync failed`;
    }

    if (app.datadogMapped === false || app.resolutionPath === 'unmapped') {
        return `${staticDesc}\nNot mapped in Datadog — health unavailable`;
    }

    const via = app.resolutionPath === 'fallback' ? ' (fallback)' : '';
    return `${staticDesc}\nLive · Datadog${via}${syncSuffix(app.lastSyncAt)}`;
}

/**
 * Builds the provenance tooltip for the Uptime column, including the metric description triad.
 * @param {PortfolioApp} app - portfolio application
 * @returns {string} human-readable provenance for a native tooltip
 */
function buildUptimeProvenance(app: PortfolioApp): string {
    const staticDesc = formatMetricTooltip(METRIC_DESCRIPTIONS.uptime);
    if (app.uptime === null) {
        return `${staticDesc}\nNo SLO in Datadog — uptime unavailable`;
    }

    return `${staticDesc}\nLive · Datadog SLO${syncSuffix(app.lastSyncAt)}`;
}

const HEALTH_RISK_WEIGHTS: Record<string, number> = { red: 3, amber: 2 };

const BURN_RISK_WEIGHTS: Record<string, number> = { 'at-risk': 2, 'fast-burn': 1 };

/**
 * Documented per-app risk weight: health severity ×2 plus burn-band severity.
 * @param {PortfolioApp} a - portfolio app
 * @returns {number} risk weight
 */
function appRisk(a: PortfolioApp): number {
    const health = HEALTH_RISK_WEIGHTS[a.health] ?? 0;
    const burn = BURN_RISK_WEIGHTS[a.burnRate?.band ?? ''] ?? 0;
    return health * 2 + burn;
}

const EMPTY_PORTFOLIO_NODE: PortfolioNode = {
    id: 'root',
    name: 'All Portfolios',
    role: '',
    owner: '',
    children: [],
    apps: [],
};

@Component({
    selector: 'polaris-portfolio-page',
    templateUrl: './portfolio-page.component.html',
    styleUrls: ['./portfolio-page.component.scss'],
    standalone: false,
})
export default class PortfolioPageComponent implements OnInit, OnDestroy {
    data: PortfolioNode = EMPTY_PORTFOLIO_NODE;

    currentNode: PortfolioNode = EMPTY_PORTFOLIO_NODE;

    topRiskNodesCache: PortfolioNode[] = [];

    topRiskAppsCache: PortfolioApp[] = [];

    expandedTreeNodes = new Set<string>();

    expandedSections = new Set<string>();

    sidebarCollapsed = false;

    isMobileViewport = false;

    isMobileSidebarOpen = false;

    breadcrumbPath: PortfolioNode[] = [];

    isLoading = true;

    loadError = '';

    readOnly = false;

    private loadSubscription?: Subscription;

    private readonly statusOrder: Array<PortfolioApp['health']> = [
        'green',
        'amber',
        'red',
        'undefined',
    ];

    private readonly incidentSeed = 0;

    private readonly healthLabels: Record<PortfolioApp['health'], string> = {
        green: 'GREEN',
        amber: 'AMBER',
        red: 'RED',
        undefined: 'Not monitored',
    };

    private readonly perceptionLabels: Record<PortfolioApp['perception'], string> = {
        green: 'GREEN',
        amber: 'AMBER',
        red: 'CRITICAL',
        undefined: 'Not monitored',
    };

    private readonly burnRateBandLabels: Record<string, string> = {
        healthy: 'Healthy — under 1.0x (within SLO budget)',
        'fast-burn': 'Fast burn — 1.0x to 2.0x (consuming budget faster than allowed)',
        'at-risk': 'At risk — over 2.0x (trending to breach)',
        unknown: 'No SLO data',
    };

    /**
     * Columns that are still placeholder (not yet wired to a live source) and are
     * rendered greyed out. Flip a flag to `false` as each column goes live so the
     * dimming disappears on its own. Health/Uptime are live Datadog and never here.
     */
    readonly placeholderColumns = {
        perception: true,
        activeUsers: true,
        incidents: true,
        lastIncident: true,
    };

    /**
     * Creates the portfolio page controller.
     * @param {object} router - router used for dashboard detail navigation
     * @param {object} route - activated route for reading snapshot/readOnly data
     * @param {object} dashboardService - service used to load dashboard data from the API
     * @param {object} dataModeService - service tracking demo vs live mode
     * @param {object} scopeService - service tracking the active portfolio scope
     * @param {object} navStateService - service preserving node/scroll state across navigation
     */
    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private dashboardService: DashboardService,
        private dataModeService: DashboardDataModeService,
        private scopeService: DashboardScopeService,
        private navStateService: DashboardNavStateService
    ) {}

    /**
     * Initializes the default dashboard view.
     */
    ngOnInit(): void {
        this.readOnly = this.route.snapshot.data.readOnly === true;
        this.updateViewportState();
        // mode$ and scope$ are BehaviorSubjects (emit immediately) — subscribing to each
        // separately fired loadPortfolio() TWICE on init, and the 2nd run cleared+clobbered
        // the restored nav state. combineLatest collapses them into a single load (13-10 fix).
        this.loadSubscription = combineLatest([
            this.dataModeService.mode$,
            this.scopeService.scope$,
        ]).subscribe(() => this.loadPortfolio());
    }

    /**
     * Releases the mode subscription when the page is destroyed.
     */
    ngOnDestroy(): void {
        this.loadSubscription?.unsubscribe();
    }

    /**
     * Updates responsive UI state when the viewport size changes.
     */
    @HostListener('window:resize')
    onWindowResize(): void {
        this.updateViewportState();
    }

    /**
     * Collects every application in the provided subtree.
     * @param {object} node - portfolio node to traverse
     * @returns {object[]} flattened application list
     */
    getAllApps(node: PortfolioNode): PortfolioApp[] {
        let apps = [...(node.apps || [])];
        (node.children || []).forEach((c) => {
            apps = apps.concat(this.getAllApps(c));
        });
        return apps;
    }

    /**
     * Counts applications by status for the selected field.
     * @param {object[]} apps - applications to summarize
     * @param {string} field - status field to count
     * @returns {object} counts grouped by status
     */
    countByStatus(apps: PortfolioApp[], field: 'health' | 'perception'): StatusCounts {
        return this.statusOrder.reduce<StatusCounts>(
            (counts, status) => ({
                ...counts,
                [status]: apps.filter((app) => app[field] === status).length,
            }),
            { green: 0, amber: 0, red: 0, undefined: 0 }
        );
    }

    /**
     * Determines the highest-severity health status in the list.
     * @param {object[]} apps - applications to inspect
     * @returns {string} worst status value
     */
    worstStatus(apps: PortfolioApp[]): string {
        const h = this.countByStatus(apps, 'health');
        if (h.red > 0) return 'red';
        if (h.amber > 0) return 'amber';
        if (h.green > 0) return 'green';
        return 'undefined';
    }

    /**
     * Provenance tooltip for the Health column: whether the value is live Datadog,
     * stale (last sync failed), or simply not mapped to Datadog.
     * @param {object} app - portfolio application
     * @returns {string} human-readable provenance for a native tooltip
     */
    healthProvenance = buildHealthProvenance;

    /**
     * Provenance tooltip for the Uptime column (Datadog SLO, or no SLO mapped).
     * @param {object} app - portfolio application
     * @returns {string} human-readable provenance for a native tooltip
     */
    uptimeProvenance = buildUptimeProvenance;

    /**
     * Determines the overall status for a portfolio node.
     * @param {object} node - node to evaluate
     * @returns {string} aggregate node status
     */
    worstNodeStatus(node: PortfolioNode): string {
        const apps = this.getAllApps(node);
        return this.worstStatus(apps.length ? apps : node.apps);
    }

    /**
     * Totals incidents across the supplied applications.
     * @param {object[]} apps - applications to summarize
     * @returns {number} incident count
     */
    totalIncidents(apps: PortfolioApp[]): number {
        return apps.reduce((total, app) => total + app.incidents, this.incidentSeed);
    }

    /**
     * Finds a node by id within the portfolio tree.
     * @param {string} id - node id to find
     * @param {object} node - current tree branch
     * @returns {object | null} matching node when found
     */
    findNode(id: string, node: PortfolioNode = this.data): PortfolioNode | null {
        if (node.id === id) return node;

        return (
            (node.children || [])
                .map((child) => this.findNode(id, child))
                .find((child): child is PortfolioNode => child !== null) || null
        );
    }

    /**
     * Builds the breadcrumb path for a node id.
     * @param {string} id - node id to resolve
     * @param {object} node - current tree branch
     * @param {object[]} path - accumulated node path
     * @returns {object[] | null} breadcrumb nodes when found
     */
    getPath(
        id: string,
        node: PortfolioNode = this.data,
        path: PortfolioNode[] = []
    ): PortfolioNode[] | null {
        if (node.id === id) return [...path, node];

        return (
            (node.children || [])
                .map((child) => this.getPath(id, child, [...path, node]))
                .find((childPath): childPath is PortfolioNode[] => childPath !== null) || null
        );
    }

    /**
     * Resolves the chain of nodes from the root down to the node that directly contains
     * the given app id, so the sidebar tree can be expanded to reveal it (preserve-nav).
     * @param {string} appId - application id to locate
     * @param {object} node - current tree branch
     * @param {object[]} path - accumulated node path
     * @returns {object[] | null} node path to the app, or null when not found
     */
    findAppNodePath(
        appId: string,
        node: PortfolioNode = this.data,
        path: PortfolioNode[] = []
    ): PortfolioNode[] | null {
        const here = [...path, node];
        if ((node.apps || []).some((app) => app.id === appId)) {
            return here;
        }
        return (
            (node.children || [])
                .map((child) => this.findAppNodePath(appId, child, here))
                .find((childPath): childPath is PortfolioNode[] => childPath !== null) || null
        );
    }

    /**
     * Restores the table scroll offset after a node restore, once the view settles.
     * @param {number} scrollTop - vertical offset to restore (no-op when <= 0).
     * @returns {void}
     */
    // eslint-disable-next-line class-methods-use-this
    private restoreScroll(scrollTop: number): void {
        if (scrollTop <= 0) {
            return;
        }
        setTimeout(() => {
            const scrollEl = document.querySelector('.table-scroll');
            if (scrollEl instanceof HTMLElement) {
                scrollEl.scrollTop = scrollTop;
            }
        }, 0);
    }

    /**
     * Switches the active dashboard node.
     * @param {string} id - node id to activate
     */
    navigateToNode(id: string): void {
        const node = this.findNode(id);
        if (!node) return;

        this.currentNode = node;
        this.breadcrumbPath = this.getPath(id) || [];
        this.recomputeTopRisks();
        this.initializeExpandedSections(node);

        if (this.isMobileViewport) {
            this.isMobileSidebarOpen = false;
        }
    }

    /**
     * Toggles the sidebar tree expansion state for a node.
     * @param {string} id - node id to toggle
     * @param {Event} event - click event from the tree control
     */
    toggleTreeNode(id: string, event: Event): void {
        event.stopPropagation();
        if (this.expandedTreeNodes.has(id)) {
            this.expandedTreeNodes.delete(id);
        } else {
            this.expandedTreeNodes.add(id);
        }
    }

    /**
     * Selects a node from the sidebar tree.
     * @param {string} id - node id to activate
     */
    selectTreeNode(id: string): void {
        this.navigateToNode(id);
        this.expandedTreeNodes.add(id);
    }

    /**
     * Toggles the collapsed state of the sidebar.
     */
    toggleSidebar(): void {
        if (this.isMobileViewport) {
            this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
            return;
        }

        this.sidebarCollapsed = !this.sidebarCollapsed;
    }

    /**
     * Closes the mobile sidebar drawer when the backdrop is pressed.
     */
    closeMobileSidebar(): void {
        this.isMobileSidebarOpen = false;
    }

    /**
     * Toggles the expansion state of a section card.
     * @param {string} id - section id to toggle
     */
    toggleSection(id: string): void {
        if (this.expandedSections.has(id)) {
            this.expandedSections.delete(id);
        } else {
            this.expandedSections.add(id);
        }
    }

    /**
     * Opens the application detail route for the selected app, saving the current node and scroll
     * position so the portfolio page can restore its state when the user navigates back.
     * @param {PortfolioApp} app - application to open
     * @returns {void}
     */
    openAppDetail(app: PortfolioApp): void {
        const scrollEl = document.querySelector('.table-scroll');
        const scrollTop = scrollEl instanceof HTMLElement ? scrollEl.scrollTop : 0;
        // Save copies of the Sets so restored state exactly matches what the user saw.
        this.navStateService.saveNodeContext(
            this.currentNode.id,
            scrollTop,
            new Set(this.expandedTreeNodes),
            new Set(this.expandedSections)
        );
        this.navStateService.setLastAppId(app.id);
        this.router.navigate(['/dashboard/app', app.id], {
            queryParams: { from: this.currentNode.id },
        });
    }

    /**
     * Resolves the UI label for a health status.
     * @param {string} status - health status value
     * @returns {string} display label
     */
    healthLabel(status: PortfolioApp['health']): string {
        return this.healthLabels[status];
    }

    /**
     * Resolves the UI label for a perception status.
     * @param {string} status - perception status value
     * @returns {string} display label
     */
    perceptionLabel(status: PortfolioApp['perception']): string {
        return this.perceptionLabels[status];
    }

    /** Overall maturity "X/5" score-label tooltip (shared builder; pass app.maturity). */
    readonly maturityScoreTooltip = buildMaturityScoreTooltip;

    /** 5 maturity segment descriptors (cls + per-block `.prov-cell` tooltip); shared builder, pass signals. */
    readonly maturitySegments = buildMaturitySegments;

    // 11-2 burn-rate (error-budget burn) ----------------------------------------

    /**
     * Formats a per-app burn rate as "x.xx" or "—" when SLO inputs are missing.
     * @param {PortfolioApp} app - portfolio app
     * @returns {string} formatted burn rate
     */
    // eslint-disable-next-line class-methods-use-this
    burnRateLabel(app: PortfolioApp): string {
        const rate = app.burnRate?.rate;
        return rate != null ? `${rate.toFixed(2)}x` : '—';
    }

    /**
     * Maps a burn-rate band to a metric color class (never a false GREEN for unknown).
     * @param {PortfolioApp} app - portfolio app
     * @returns {string} css class for the burn-rate cell
     */
    // eslint-disable-next-line class-methods-use-this
    burnRateClass(app: PortfolioApp): string {
        switch (app.burnRate?.band) {
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
     * Tooltip describing the burn-rate band for the cell, prefixed with the metric triad.
     * @param {PortfolioApp} app - portfolio app
     * @returns {string} multi-line provenance tooltip with metric triad and band description
     */
    burnRateTooltip(app: PortfolioApp): string {
        const staticDesc = formatMetricTooltip(METRIC_DESCRIPTIONS.burnRate);
        const bandDesc = this.burnRateBandLabels[app.burnRate?.band ?? 'unknown'] ?? 'No SLO data';
        return `${staticDesc}\n${bandDesc}`;
    }

    // 11-1 risk roll-up + top-risks --------------------------------------------

    /**
     * Roll-up for a node — prefers the API-provided rollup, falls back to a local
     * derivation so the badges render even if an older payload lacks it. The local
     * fallback never marks an unmonitored app GREEN.
     * @param {PortfolioNode} node - portfolio node
     * @returns {PortfolioRollup} aggregate roll-up
     */
    nodeRollup(node: PortfolioNode): PortfolioRollup {
        if (node.rollup) {
            return node.rollup;
        }
        const apps = this.getAllApps(node);
        const n = apps.length;
        if (!n) {
            return {
                appCount: 0,
                healthyPct: null,
                coveragePct: null,
                sloPassingPct: null,
                avgMaturity: null,
                fastBurnCount: 0,
            };
        }
        const pct = (s: number) => Math.round((s / n) * 1000) / 10;
        return {
            appCount: n,
            healthyPct: pct(apps.filter((a) => a.datadogMapped && a.health === 'green').length),
            coveragePct: pct(apps.filter((a) => a.datadogMapped).length),
            sloPassingPct: null,
            avgMaturity: null,
            fastBurnCount: apps.filter(
                (a) => a.burnRate?.band === 'fast-burn' || a.burnRate?.band === 'at-risk'
            ).length,
        };
    }

    /**
     * Formats a roll-up percentage, or "—" when it is null (missing data, 5-6).
     * @param {number | null} value - percentage value
     * @returns {string} formatted percentage
     */
    // eslint-disable-next-line class-methods-use-this
    rollupPct(value: number | null): string {
        return value != null ? `${value}%` : '—';
    }

    /**
     * Transparent node risk ordering (11-1): rank by a documented score —
     * (200 − coveragePct − healthyPct), weighted toward larger nodes by log10(appCount+1).
     * Lower coverage and lower health raise the score; bigger nodes break ties upward.
     * @param {PortfolioRollup} r - node roll-up
     * @returns {number} risk score (higher = riskier)
     */
    // eslint-disable-next-line class-methods-use-this
    private riskScore(r: PortfolioRollup): number {
        const cov = r.coveragePct ?? 0;
        const healthy = r.healthyPct ?? 0;
        return (200 - cov - healthy) * Math.log10(r.appCount + 1);
    }

    /**
     *
     */
    private recomputeTopRisks(): void {
        this.topRiskNodesCache = this.computeTopRiskNodes();
        this.topRiskAppsCache = this.computeTopRiskApps();
    }

    /**
     * Up to five highest-risk descendant nodes of the current node, ordered by riskScore.
     * @returns {PortfolioNode[]} top risk nodes
     */
    private computeTopRiskNodes(): PortfolioNode[] {
        const acc: PortfolioNode[] = [];
        const walk = (node: PortfolioNode) => {
            (node.children || []).forEach((c) => {
                acc.push(c);
                walk(c);
            });
        };
        walk(this.currentNode);
        return acc
            .filter((nd) => this.nodeRollup(nd).appCount > 0)
            .sort((a, b) => this.riskScore(this.nodeRollup(b)) - this.riskScore(this.nodeRollup(a)))
            .slice(0, 5);
    }

    /**
     * Up to five monitored apps to review (degraded health or fast-burning error budget)
     * under the current node (excludes apps with no Datadog data): RED/AMBER health or an
     * at-risk burn rate, ordered by a documented health×2 + burn-band weighting.
     * @returns {PortfolioApp[]} monitored apps to review (degraded health or fast-burning error budget)
     */
    private computeTopRiskApps(): PortfolioApp[] {
        return (
            this.getAllApps(this.currentNode)
                // df-4: exclude catalog apps with no Datadog data — they read AMBER only because
                // they're unmapped (5-6), which is "no data", not "worst". Never list them as risky.
                .filter((a) => a.datadogMapped !== false)
                .filter(
                    (a) =>
                        a.health === 'red' || a.health === 'amber' || a.burnRate?.band === 'at-risk'
                )
                .sort((a, b) => appRisk(b) - appRisk(a))
                .slice(0, 5)
        );
    }

    /**
     * Expands the relevant section panels for the active node.
     * @param {object} node - active portfolio node
     */
    private initializeExpandedSections(node: PortfolioNode): void {
        this.expandedSections = new Set<string>();

        if (node.id === 'root') {
            (node.children || []).forEach((child) => this.expandAllSections(child));
            return;
        }

        (node.children || []).forEach((child) => this.expandedSections.add(child.id));
    }

    /**
     * Recursively expands every nested section under the node.
     * @param {object} node - node whose descendants should expand
     */
    private expandAllSections(node: PortfolioNode): void {
        this.expandedSections.add(node.id);
        (node.children || []).forEach((child) => this.expandAllSections(child));
    }

    /**
     * Loads the portfolio tree from the backend, then restores any previously saved
     * node and scroll position from DashboardNavStateService (e.g. after navigating
     * back from the detail page).
     * @returns {void}
     */
    private loadPortfolio(): void {
        this.isLoading = true;
        this.loadError = '';

        this.dashboardService.getPortfolio().subscribe({
            next: (portfolio) => {
                this.data = portfolio;
                this.currentNode = portfolio;
                this.expandedTreeNodes = new Set<string>();
                this.initializeExpandedTreeNodes(portfolio);

                const returnNodeId = this.navStateService.getLastNodeId();
                const returnScrollTop = this.navStateService.getLastScrollTop();
                const returnExpandedTree = this.navStateService.getLastExpandedTreeNodes();
                const returnExpandedSections = this.navStateService.getLastExpandedSections();
                const returnAppId = this.navStateService.getLastAppId();
                this.navStateService.clearNodeContext();

                // Path to the app the user opened (from the right-side table OR the top-bar
                // search). Expanding it keeps the sidebar open down to that app on return.
                const appPath = returnAppId ? this.findAppNodePath(returnAppId) : null;

                if (appPath && appPath.length > 0) {
                    if (returnExpandedTree.size > 0) {
                        this.expandedTreeNodes = returnExpandedTree;
                    }
                    appPath.forEach((pathNode) => this.expandedTreeNodes.add(pathNode.id));
                    if (returnExpandedSections.size > 0) {
                        this.expandedSections = returnExpandedSections;
                    }
                    // Land on the app's own node so it is highlighted + breadcrumbed with the
                    // tree expanded down to it — consistent for the table, the "Apps to review"
                    // panel, and the top-bar search (not just left open at the app's branch
                    // while the selection/breadcrumb stay on the previous node).
                    this.navigateToNode(appPath[appPath.length - 1].id);
                } else if (returnNodeId && this.findNode(returnNodeId)) {
                    if (returnExpandedTree.size > 0) {
                        this.expandedTreeNodes = returnExpandedTree;
                    }
                    if (returnExpandedSections.size > 0) {
                        this.expandedSections = returnExpandedSections;
                    }
                    this.navigateToNode(returnNodeId);
                    this.restoreScroll(returnScrollTop);
                } else {
                    this.navigateToNode(portfolio.id);
                }

                this.isLoading = false;
            },
            error: () => {
                this.loadError = 'Unable to load dashboard data from the backend.';
                this.isLoading = false;
            },
        });
    }

    /**
     * Expands only the root node on load — the tree is collapsed by default
     * (Anand feedback 2026-06-18); deeper levels expand on demand.
     * @param {object} node - portfolio node to expand
     * @param {number} depth - current tree depth
     */
    private initializeExpandedTreeNodes(node: PortfolioNode, depth = 0): void {
        if (depth > 0) {
            return;
        }

        this.expandedTreeNodes.add(node.id);
        (node.children || []).forEach((child) =>
            this.initializeExpandedTreeNodes(child, depth + 1)
        );
    }

    /**
     * Tracks whether the portfolio page should use the mobile drawer layout.
     */
    private updateViewportState(): void {
        this.isMobileViewport = window.innerWidth <= 800;

        if (!this.isMobileViewport) {
            this.isMobileSidebarOpen = false;
        }
    }
}
