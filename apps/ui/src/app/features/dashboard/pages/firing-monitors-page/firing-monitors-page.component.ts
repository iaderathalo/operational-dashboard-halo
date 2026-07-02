import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { PortfolioNode } from '../../models/portfolio.model';
import {
    collectFiringMonitors,
    countMonitorsByState,
    FiringMonitorRow,
} from '../../monitor-rollup.util';
import { findNode, getAllApps } from '../../portfolio-tree.util';
import DashboardService from '../../services/dashboard.service';
import { formatStateDuration } from '../detail-page/detail-page.data';

export type FiringStateFilter = 'all' | 'alert' | 'warn';

/** Alert sorts before Warn — "worst first" (01-value-benefit.md / 02-ux-ui-design.md §6). */
const STATE_SEVERITY: Record<'alert' | 'warn', number> = { alert: 0, warn: 1 };

/**
 * Worst-first row comparator (US-2.4): Alert before Warn; within a severity, the
 * longest-firing monitor first (oldest `lastTriggeredAt` first). Rows with no
 * `lastTriggeredAt` sort last within their severity tier — there is no basis to treat
 * an unknown duration as the longest-firing one.
 * @param {FiringMonitorRow} a - left-hand row
 * @param {FiringMonitorRow} b - right-hand row
 * @returns {number} standard comparator result
 */
function byWorstFirst(a: FiringMonitorRow, b: FiringMonitorRow): number {
    const severityDiff = STATE_SEVERITY[a.state] - STATE_SEVERITY[b.state];
    if (severityDiff !== 0) return severityDiff;

    const aTime = a.lastTriggeredAt ? Date.parse(a.lastTriggeredAt) : Infinity;
    const bTime = b.lastTriggeredAt ? Date.parse(b.lastTriggeredAt) : Infinity;
    return aTime - bTime;
}

@Component({
    selector: 'polaris-firing-monitors-page',
    templateUrl: './firing-monitors-page.component.html',
    styleUrls: ['./firing-monitors-page.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule],
})
/**
 * US-2.4 drill-down for the portfolio page's Monitors rollup tile (US-1.4): every
 * Alert/Warn monitor under the node the tile was clicked from. Reads the portfolio
 * scope from `?scope=<nodeId>` and re-fetches the portfolio itself (Decision section,
 * `03-senior-implementation-plan.md`) so a bookmarked or hard-refreshed link works with
 * zero shared state, exactly like `DetailPageComponent` fetches its own app by id.
 */
export default class FiringMonitorsPageComponent implements OnInit {
    isLoading = true;

    loadError = '';

    scopeId = '';

    scopeName = '';

    allRows: FiringMonitorRow[] = [];

    filteredRows: FiringMonitorRow[] = [];

    /** Monitors reporting No Data in scope — never rendered as rows (AC1), only counted. */
    noDataCount = 0;

    /** Distinct effective service values (tag-or-fallback) actually present in scope. */
    serviceOptions: string[] = [];

    serviceFilter = 'all';

    stateFilter: FiringStateFilter = 'all';

    /**
     * Creates the firing-monitors page controller.
     * @param {object} route - activated route used to read the `scope`/`state`/`service` query params
     * @param {object} router - router used for "Back to Portfolio" and filter URL updates
     * @param {object} dashboardService - service used to (re)load the portfolio tree from the API
     */
    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private dashboardService: DashboardService
    ) {}

    /**
     * Resolves the scope, loads the portfolio, and derives the firing-monitor rows.
     * @returns {void}
     */
    ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        this.scopeId = params.get('scope') || '';
        const rawState = params.get('state');
        this.stateFilter = rawState === 'alert' || rawState === 'warn' ? rawState : 'all';
        this.serviceFilter = params.get('service') || 'all';

        this.isLoading = true;
        this.loadError = '';

        this.dashboardService.getPortfolio().subscribe({
            next: (portfolio) => this.onPortfolioLoaded(portfolio),
            error: () => {
                this.loadError = 'Unable to load firing monitors from the backend.';
                this.isLoading = false;
            },
        });
    }

    /**
     * Applies the Service/State filters to `allRows`, storing the result in
     * `filteredRows`, and writes the current filter values to the URL so the view is
     * shareable/bookmarkable without adding browser-history noise (mirrors
     * `DetailPageComponent.setTab`).
     * @returns {void}
     */
    onFilterChange(): void {
        this.applyFilters();
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: {
                scope: this.scopeId,
                state: this.stateFilter,
                service: this.serviceFilter,
            },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    }

    /**
     * Resets both filters to "all" — the "Clear filters" affordance shown alongside
     * the no-results-from-filter state.
     * @returns {void}
     */
    clearFilters(): void {
        this.stateFilter = 'all';
        this.serviceFilter = 'all';
        this.onFilterChange();
    }

    /**
     * Navigates back to the portfolio page, which restores the exact node/scroll/tree
     * state that was saved before the tile was clicked (`loadPortfolio()`,
     * `portfolio-page.component.ts`) — no restore logic needed here.
     * @returns {void}
     */

    /**
     *
     */
    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    /**
     * Open-ended "firing since" duration for a row, or "—" when Datadog never
     * reported a last-triggered time. The monitor still qualifies for the list either
     * way (Edge Cases) — a missing timestamp is a display gap, not an exclusion rule.
     * @param {FiringMonitorRow} row - the row being rendered
     * @returns {string} human-readable duration, or "—"
     */
    // eslint-disable-next-line class-methods-use-this
    firingDuration(row: FiringMonitorRow): string {
        return row.lastTriggeredAt
            ? formatStateDuration(row.lastTriggeredAt, new Date().toISOString())
            : '—';
    }

    /**
     * Native-tooltip text for the Firing column: the exact timestamp when known, or an
     * explanation of why it is unavailable.
     * @param {FiringMonitorRow} row - the row being rendered
     * @returns {string} tooltip text
     */
    // eslint-disable-next-line class-methods-use-this
    firingTooltip(row: FiringMonitorRow): string {
        return row.lastTriggeredAt
            ? `Last triggered ${row.lastTriggeredAt}`
            : 'Datadog did not report a last-triggered time for this monitor';
    }

    /**
     * Resolves the scoped node, derives the firing rows and service filter options,
     * and applies the initial (URL-driven) filters.
     * @param {PortfolioNode} portfolio - the freshly-fetched portfolio tree
     * @returns {void}
     */
    private onPortfolioLoaded(portfolio: PortfolioNode): void {
        const resolved = (this.scopeId && findNode(this.scopeId, portfolio)) || portfolio;
        this.scopeId = resolved.id;
        this.scopeName = resolved.name;

        const apps = getAllApps(resolved);
        this.allRows = collectFiringMonitors(apps).sort(byWorstFirst);
        this.noDataCount = countMonitorsByState(apps).noData;
        this.serviceOptions = Array.from(new Set(this.allRows.map((row) => row.service))).sort(
            (a, b) => a.localeCompare(b)
        );

        this.applyFilters();
        this.isLoading = false;
    }

    /**
     * Filters `allRows` by the active Service/State selections into `filteredRows`.
     * @returns {void}
     */
    private applyFilters(): void {
        this.filteredRows = this.allRows.filter((row) => {
            const stateOk = this.stateFilter === 'all' || row.state === this.stateFilter;
            const serviceOk = this.serviceFilter === 'all' || row.service === this.serviceFilter;
            return stateOk && serviceOk;
        });
    }
}
