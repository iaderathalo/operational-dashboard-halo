import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { PortfolioNode, PortfolioApp } from '../../models/portfolio.model';
import DashboardService from '../../services/dashboard.service';
import { collectSloApps, SloRow, SloState } from '../../slo-rollup.util';

@Component({
    selector: 'polaris-slo-page',
    templateUrl: './slo-page.component.html',
    styleUrls: ['./slo-page.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule],
})
/**
 * Drill-down page showing per-app SLO attainment and error-budget details
 * for all apps under a given portfolio scope node.
 */
export default class SloPageComponent implements OnInit, OnDestroy {
    isLoading = true;

    loadError = '';

    rows: SloRow[] = [];

    filteredRows: SloRow[] = [];

    /** Currently selected state filter; empty string means all. */
    stateFilter = '';

    /** Currently selected business-unit filter; empty string means all. */
    buFilter = '';

    /** Available business units for the filter dropdown. */
    businessUnits: string[] = [];

    private scopeId = '';

    private portfolio!: PortfolioNode;

    private loadSub?: Subscription;

    /**
     * Creates the SLO drill-down page controller.
     * @param {object} router - Angular router for navigation
     * @param {object} route - activated route for reading query params
     * @param {object} dashboardService - service used to load portfolio data
     */
    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private dashboardService: DashboardService
    ) {}

    /**
     * Initializes the drill-down page: reads query params and loads portfolio data.
     */
    ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        this.scopeId = params.get('scope') || '';
        this.stateFilter = params.get('state') || '';
        this.buFilter = params.get('bu') || '';

        this.loadSub = this.dashboardService.getPortfolio().subscribe({
            next: (portfolio) => {
                this.portfolio = portfolio;
                const scopeNode = this.scopeId
                    ? this.findNode(this.scopeId, portfolio) || portfolio
                    : portfolio;
                const apps = this.getAllApps(scopeNode);
                const buMap = this.buildBuMap(scopeNode);
                this.rows = collectSloApps(apps, buMap);
                this.businessUnits = this.extractBusinessUnits(scopeNode);
                this.applyFilters();
                this.isLoading = false;
            },
            error: () => {
                this.loadError = 'Unable to load portfolio data.';
                this.isLoading = false;
            },
        });
    }

    /**
     * Cleans up the load subscription.
     */
    ngOnDestroy(): void {
        this.loadSub?.unsubscribe();
    }

    /**
     * Navigates back to the portfolio dashboard.
     */
    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    /**
     * Applies the current state and business-unit filters, then updates the URL.
     */
    applyFilters(): void {
        let result = this.rows;

        if (this.stateFilter) {
            result = result.filter((r) => r.state === this.stateFilter);
        }

        if (this.buFilter) {
            result = result.filter((r) => r.businessUnit === this.buFilter);
        }

        this.filteredRows = result;
        this.syncQueryParams();
    }

    /**
     * CSS class for the state badge in the table.
     * @param {SloState} state - SLO state
     * @returns {string} CSS class name
     */
    // eslint-disable-next-line class-methods-use-this
    stateClass(state: SloState): string {
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
     * Human-readable label for a state value.
     * @param {SloState} state - SLO state
     * @returns {string} display label
     */
    // eslint-disable-next-line class-methods-use-this
    stateLabel(state: SloState): string {
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
     * Human-readable label for a burn-rate band.
     * @param {string} band - burn-rate band
     * @returns {string} display label
     */
    // eslint-disable-next-line class-methods-use-this
    burnBandLabel(band: string): string {
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
     * CSS class for the burn-rate band column.
     * @param {string} band - burn-rate band
     * @returns {string} CSS class name
     */
    // eslint-disable-next-line class-methods-use-this
    burnBandClass(band: string): string {
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
     * Formats an uptime or budget percentage, or "—" when null.
     * @param {number | null} value - percentage value
     * @returns {string} formatted value
     */
    // eslint-disable-next-line class-methods-use-this
    formatPct(value: number | null): string {
        return value != null ? `${value.toFixed(2)}%` : '—';
    }

    /**
     * Formats SLA target as a percentage or "—" when null.
     * @param {number | null} value - SLA target value
     * @returns {string} formatted value
     */
    // eslint-disable-next-line class-methods-use-this
    formatTarget(value: number | null): string {
        return value != null ? `${value}%` : '—';
    }

    /**
     * Finds a node by id within the portfolio tree.
     * @param {string} id - node id to find
     * @param {PortfolioNode} node - tree root
     * @returns {PortfolioNode | null} matching node
     */
     
    /**
     *
     * @param id
     * @param node
     */
    private findNode(id: string, node: PortfolioNode): PortfolioNode | null {
        if (node.id === id) return node;
        return (
            (node.children || [])
                .map((child) => this.findNode(id, child))
                .find((child): child is PortfolioNode => child !== null) || null
        );
    }

    /**
     * Collects every application in the provided subtree.
     * @param {PortfolioNode} node - portfolio node to traverse
     * @returns {PortfolioApp[]} flattened application list
     */
     
    /**
     *
     * @param node
     */
    private getAllApps(node: PortfolioNode): PortfolioApp[] {
        let apps = [...(node.apps || [])];
        (node.children || []).forEach((c) => {
            apps = apps.concat(this.getAllApps(c));
        });
        return apps;
    }

    /**
     * Builds a map from appId → nearest ancestor node name (business unit).
     * @param {PortfolioNode} node - scope node
     * @param {string} parentName - ancestor name to assign
     * @returns {Record<string, string>} appId → business unit name
     */
    private buildBuMap(node: PortfolioNode, parentName = ''): Record<string, string> {
        const map: Record<string, string> = {};
        const label = parentName || node.name;
        (node.apps || []).forEach((app) => {
            map[app.id] = label;
        });
        (node.children || []).forEach((child) => {
            Object.assign(map, this.buildBuMap(child, child.name));
        });
        return map;
    }

    /**
     * Extracts unique business-unit names from the immediate children of a node.
     * @param {PortfolioNode} node - scope node
     * @returns {string[]} sorted list of business unit names
     */
    // eslint-disable-next-line class-methods-use-this
    private extractBusinessUnits(node: PortfolioNode): string[] {
        const names = new Set<string>();
        (node.children || []).forEach((child) => {
            if (child.name) names.add(child.name);
        });
        return Array.from(names).sort();
    }

    /**
     * Syncs filter state to URL query params (replace, no navigation).
     */
    private syncQueryParams(): void {
        const queryParams: Record<string, string> = {};
        if (this.scopeId) queryParams.scope = this.scopeId;
        if (this.stateFilter) queryParams.state = this.stateFilter;
        if (this.buFilter) queryParams.bu = this.buFilter;

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams,
            queryParamsHandling: 'replace' as any,
            replaceUrl: true,
        });
    }
}
