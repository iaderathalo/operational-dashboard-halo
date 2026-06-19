import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { PortfolioNode, PortfolioApp, StatusCounts } from '../../models/portfolio.model';
import DashboardDataModeService from '../../services/dashboard-data-mode.service';
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
 *
 * @param app
 */
function buildHealthProvenance(app: PortfolioApp): string {
    if (app.lastSyncStatus === 'error') {
        return 'Stale — last Datadog sync failed';
    }

    if (app.datadogMapped === false || app.resolutionPath === 'unmapped') {
        return 'Not mapped in Datadog — health unavailable';
    }

    const via = app.resolutionPath === 'fallback' ? ' (fallback)' : '';
    return `Live · Datadog${via}${syncSuffix(app.lastSyncAt)}`;
}

/**
 *
 * @param app
 */
function buildUptimeProvenance(app: PortfolioApp): string {
    if (app.uptime === null) {
        return 'No SLO in Datadog — uptime unavailable';
    }

    return `Live · Datadog SLO${syncSuffix(app.lastSyncAt)}`;
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

    expandedTreeNodes = new Set<string>();

    expandedSections = new Set<string>();

    sidebarCollapsed = false;

    isMobileViewport = false;

    isMobileSidebarOpen = false;

    breadcrumbPath: PortfolioNode[] = [];

    isLoading = true;

    loadError = '';

    private modeSubscription?: Subscription;

    private scopeSubscription?: Subscription;

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

    private readonly maturitySignalLabels: Record<string, string> = {
        mapped: 'Mapped to Datadog',
        hasMonitor: 'Has monitors',
        hasSLO: 'Has SLO',
        sloPassing: 'SLO passing',
        hasOwner: 'Has owner',
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
     * @param {object} dashboardService - service used to load dashboard data from the API
     * @param dataModeService
     * @param scopeService
     */
    constructor(
        private router: Router,
        private dashboardService: DashboardService,
        private dataModeService: DashboardDataModeService,
        private scopeService: DashboardScopeService
    ) {}

    /**
     * Initializes the default dashboard view.
     */
    ngOnInit(): void {
        this.updateViewportState();
        this.modeSubscription = this.dataModeService.mode$.subscribe(() => this.loadPortfolio());
        this.scopeSubscription = this.scopeService.scope$.subscribe(() => this.loadPortfolio());
    }

    /**
     * Releases the mode subscription when the page is destroyed.
     */
    ngOnDestroy(): void {
        this.modeSubscription?.unsubscribe();
        this.scopeSubscription?.unsubscribe();
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
     * Switches the active dashboard node.
     * @param {string} id - node id to activate
     */
    navigateToNode(id: string): void {
        const node = this.findNode(id);
        if (!node) return;

        this.currentNode = node;
        this.breadcrumbPath = this.getPath(id) || [];
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
     * Opens the application detail route for the selected app.
     * @param {object} app - application to open
     */
    openAppDetail(app: PortfolioApp): void {
        this.router.navigate(['/dashboard/app', app.id]);
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

    /**
     * Builds a per-signal breakdown tooltip for the maturity score.
     * @param {PortfolioApp} app - portfolio app
     * @returns {string} breakdown like "✓ Mapped to Datadog · ✗ Has SLO ..."
     */
    maturityTooltip(app: PortfolioApp): string {
        if (!app.maturity) {
            return 'No maturity data';
        }
        return Object.entries(app.maturity.signals)
            .map(([key, met]) => `${met ? '✓' : '✗'} ${this.maturitySignalLabels[key] ?? key}`)
            .join(' · ');
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
     * Loads the portfolio tree from the backend.
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
                this.navigateToNode(portfolio.id);
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
