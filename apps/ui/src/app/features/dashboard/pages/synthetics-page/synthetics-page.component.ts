import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { PortfolioApp, PortfolioNode } from '../../models/portfolio.model';
import DashboardService from '../../services/dashboard.service';
import { collectSynthetics, SyntheticRow, SyntheticState } from '../../synthetic-rollup.util';

@Component({
    selector: 'polaris-synthetics-page',
    templateUrl: './synthetics-page.component.html',
    styleUrls: ['./synthetics-page.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule],
})
/**
 * Drill-down page showing per-check synthetic journey details
 * for all apps under a given portfolio scope node.
 */
export default class SyntheticsPageComponent implements OnInit, OnDestroy {
    isLoading = true;

    loadError = '';

    rows: SyntheticRow[] = [];

    filteredRows: SyntheticRow[] = [];

    /** Currently selected state filter; empty string means all. */
    stateFilter = '';

    /** Currently selected type filter; empty string means all. */
    typeFilter = '';

    /** Available check types for the filter dropdown. */
    checkTypes: string[] = [];

    private scopeId = '';

    private loadSub?: Subscription;

    /**
     * Creates the synthetics drill-down page controller.
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
        this.typeFilter = params.get('type') || '';

        this.loadSub = this.dashboardService.getPortfolio().subscribe({
            next: (portfolio) => {
                const scopeNode = this.scopeId
                    ? this.findNode(this.scopeId, portfolio) || portfolio
                    : portfolio;
                const apps = this.getAllApps(scopeNode);
                this.rows = collectSynthetics(apps);
                this.checkTypes = this.extractTypes();
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
     * Applies the current state and type filters, then updates the URL.
     */
    applyFilters(): void {
        let result = this.rows;

        if (this.stateFilter) {
            result = result.filter((r) => r.state === this.stateFilter);
        }

        if (this.typeFilter) {
            result = result.filter((r) => r.type === this.typeFilter);
        }

        this.filteredRows = result;
        this.syncQueryParams();
    }

    /**
     * CSS class for the state badge in the table.
     * @param {SyntheticState} state - synthetic state
     * @returns {string} CSS class name
     */
    // eslint-disable-next-line class-methods-use-this
    stateClass(state: SyntheticState): string {
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
     * Human-readable label for a state value.
     * @param {SyntheticState} state - synthetic state
     * @returns {string} display label
     */
    // eslint-disable-next-line class-methods-use-this
    stateLabel(state: SyntheticState): string {
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
     * Formats an uptime percentage, or "—" when null.
     * @param {number | null} value - uptime percentage
     * @returns {string} formatted value
     */
    // eslint-disable-next-line class-methods-use-this
    formatPct(value: number | null): string {
        return value != null ? `${value.toFixed(2)}%` : '—';
    }

    /**
     * Extracts unique check types from the loaded rows.
     * @returns {string[]} sorted list of check types
     */
    private extractTypes(): string[] {
        const types = new Set<string>();
        this.rows.forEach((r) => {
            if (r.type) types.add(r.type);
        });
        return Array.from(types).sort();
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
     * Syncs filter state to URL query params (replace, no navigation).
     */
    private syncQueryParams(): void {
        const queryParams: Record<string, string> = {};
        if (this.scopeId) queryParams.scope = this.scopeId;
        if (this.stateFilter) queryParams.state = this.stateFilter;
        if (this.typeFilter) queryParams.type = this.typeFilter;

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams,
            queryParamsHandling: 'replace' as any,
            replaceUrl: true,
        });
    }
}
