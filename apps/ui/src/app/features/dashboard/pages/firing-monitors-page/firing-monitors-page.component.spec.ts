/**
 * Unit tests for FiringMonitorsPageComponent (US-2.4).
 * Scope resolution / filtering / URL-writing are tested via a lightweight
 * `new FiringMonitorsPageComponent(...)` construction (no TestBed), matching the
 * dependency-free convention already used by portfolio-page.component.spec.ts and
 * detail-page.component.spec.ts. Deep-link markup (AC4) needs real DOM, so that one
 * concern is covered by a small TestBed-rendered block at the bottom of this file —
 * this component is standalone, so no NgModule wiring is required for that either.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { mock, MockProxy } from 'jest-mock-extended';
import { of, throwError } from 'rxjs';

import { ApplicationMonitor } from '@operational-dashboard/shared-api-model/model/dashboard';

import FiringMonitorsPageComponent from './firing-monitors-page.component';
import { PortfolioApp, PortfolioNode } from '../../models/portfolio.model';
import DashboardService from '../../services/dashboard.service';

/**
 * Minimal valid ApplicationMonitor builder for firing-monitors-page tests.
 * @param overrides
 */
function makeMonitor(overrides: Partial<ApplicationMonitor> & { id: number }): ApplicationMonitor {
    return {
        name: 'Monitor',
        status: 'GREEN',
        message: '',
        lastTriggeredAt: null,
        inMaintenance: false,
        ...overrides,
    };
}

/**
 * Minimal valid PortfolioApp builder for firing-monitors-page tests.
 * @param overrides
 */
function makeApp(overrides: Partial<PortfolioApp>): PortfolioApp {
    return {
        id: 'app-1',
        name: 'App One',
        health: 'green',
        perception: 'green',
        uptime: null,
        users: 0,
        totalInternalUsers: 0,
        totalExternalUsers: 0,
        activeUsers: null,
        incidents: 0,
        lastIncident: '',
        ...overrides,
    };
}

/**
 * Minimal valid PortfolioNode builder for firing-monitors-page tests.
 * @param overrides
 */
function makeNode(overrides: Partial<PortfolioNode>): PortfolioNode {
    return {
        id: 'root',
        name: 'Root',
        role: '',
        owner: '',
        children: [],
        apps: [],
        ...overrides,
    };
}

/**
 * Builds an ActivatedRoute stub carrying the given query params as a snapshot.
 * @param query
 */
function makeRoute(query: Record<string, string> = {}): ActivatedRoute {
    return {
        snapshot: { queryParamMap: convertToParamMap(query) },
    } as unknown as ActivatedRoute;
}

describe('FiringMonitorsPageComponent — scope resolution + filtering (US-2.4)', () => {
    let router: MockProxy<Router>;
    let dashboardService: MockProxy<DashboardService>;

    beforeEach(() => {
        router = mock<Router>();
        dashboardService = mock<DashboardService>();
    });

    /**
     * Constructs the component with the given portfolio/query and drives ngOnInit.
     * @param portfolio
     * @param query
     */
    function load(
        portfolio: PortfolioNode,
        query: Record<string, string> = {}
    ): FiringMonitorsPageComponent {
        dashboardService.getPortfolio.mockReturnValue(of(portfolio));
        const component = new FiringMonitorsPageComponent(
            makeRoute(query),
            router,
            dashboardService
        );
        component.ngOnInit();
        return component;
    }

    it('resolves the node named by ?scope= and derives rows only from its subtree', () => {
        const alertMonitor = makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED' });
        const child = makeNode({
            id: 'child',
            name: 'Child BU',
            apps: [makeApp({ monitors: [alertMonitor] })],
        });
        const siblingWithNoise = makeNode({
            id: 'sibling',
            name: 'Sibling BU',
            apps: [
                makeApp({
                    id: 'app-2',
                    monitors: [makeMonitor({ id: 2, datadogState: 'Alert', status: 'RED' })],
                }),
            ],
        });
        const root = makeNode({ id: 'root', children: [child, siblingWithNoise] });

        const component = load(root, { scope: 'child' });

        expect(component.scopeId).toBe('child');
        expect(component.scopeName).toBe('Child BU');
        expect(component.allRows).toHaveLength(1);
        expect(component.allRows[0].monitorId).toBe(1);
    });

    it('falls back to the portfolio root when ?scope= is absent', () => {
        const root = makeNode({ id: 'root', name: 'All Portfolios' });
        const component = load(root, {});
        expect(component.scopeId).toBe('root');
        expect(component.scopeName).toBe('All Portfolios');
    });

    it('falls back to the portfolio root when ?scope= points at a removed/unknown node', () => {
        const root = makeNode({ id: 'root', name: 'All Portfolios' });
        const component = load(root, { scope: 'does-not-exist' });
        expect(component.scopeId).toBe('root');
        expect(component.scopeName).toBe('All Portfolios');
        expect(component.loadError).toBe('');
    });

    it('includes only Warn/Alert monitors, excluding OK and No Data', () => {
        const app = makeApp({
            monitors: [
                makeMonitor({ id: 1, datadogState: 'OK', status: 'GREEN' }),
                makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER' }),
                makeMonitor({ id: 3, datadogState: 'Alert', status: 'RED' }),
                makeMonitor({ id: 4, datadogState: 'No Data', status: 'AMBER' }),
            ],
        });
        const component = load(makeNode({ apps: [app] }));

        expect(component.allRows.map((r) => r.monitorId).sort()).toEqual([2, 3]);
        expect(component.noDataCount).toBe(1);
    });

    it('sorts Alert before Warn, then longest-firing first within a severity', () => {
        const now = Date.now();
        const app = makeApp({
            monitors: [
                makeMonitor({
                    id: 1,
                    name: 'recent-warn',
                    datadogState: 'Warn',
                    status: 'AMBER',
                    lastTriggeredAt: new Date(now - 60_000).toISOString(),
                }),
                makeMonitor({
                    id: 2,
                    name: 'old-warn',
                    datadogState: 'Warn',
                    status: 'AMBER',
                    lastTriggeredAt: new Date(now - 3_600_000).toISOString(),
                }),
                makeMonitor({
                    id: 3,
                    name: 'the-alert',
                    datadogState: 'Alert',
                    status: 'RED',
                    lastTriggeredAt: new Date(now - 10_000).toISOString(),
                }),
            ],
        });
        const component = load(makeNode({ apps: [app] }));

        expect(component.allRows.map((r) => r.name)).toEqual([
            'the-alert',
            'old-warn',
            'recent-warn',
        ]);
    });

    it('reads the initial state/service filters from the URL and applies them', () => {
        const app = makeApp({
            monitors: [
                makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED', service: 'svc-a' }),
                makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER', service: 'svc-b' }),
            ],
        });
        const component = load(makeNode({ apps: [app] }), { state: 'alert', service: 'svc-a' });

        expect(component.filteredRows).toHaveLength(1);
        expect(component.filteredRows[0].monitorId).toBe(1);
    });

    it('onFilterChange narrows filteredRows and writes scope/state/service to the URL (merge, replaceUrl)', () => {
        const app = makeApp({
            monitors: [
                makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED' }),
                makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER' }),
            ],
        });
        const component = load(makeNode({ id: 'root', apps: [app] }));

        component.stateFilter = 'alert';
        component.onFilterChange();

        expect(component.filteredRows).toHaveLength(1);
        expect(router.navigate).toHaveBeenCalledWith([], {
            relativeTo: expect.anything(),
            queryParams: { scope: 'root', state: 'alert', service: 'all' },
            queryParamsHandling: 'merge',
            replaceUrl: true,
        });
    });

    it('clearFilters resets both filters back to "all"', () => {
        const app = makeApp({
            monitors: [
                makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED', service: 'svc-a' }),
            ],
        });
        const component = load(makeNode({ apps: [app] }), { state: 'alert', service: 'svc-a' });

        component.clearFilters();

        expect(component.stateFilter).toBe('all');
        expect(component.serviceFilter).toBe('all');
        expect(component.filteredRows).toHaveLength(1);
    });

    it('exposes distinct effective service values (tag-or-fallback) for the Service filter', () => {
        const app = makeApp({
            name: 'Fallback App',
            monitors: [
                makeMonitor({
                    id: 1,
                    datadogState: 'Alert',
                    status: 'RED',
                    service: 'auto-choice-api',
                }),
                makeMonitor({ id: 2, datadogState: 'Warn', status: 'AMBER' }), // no tag -> falls back to app name
            ],
        });
        const component = load(makeNode({ apps: [app] }));

        expect(component.serviceOptions).toEqual(['auto-choice-api', 'Fallback App']);
    });

    it('shows the all-clear state (empty allRows) when nothing is firing in scope', () => {
        const component = load(makeNode({ apps: [makeApp({ monitors: [] })] }));
        expect(component.allRows).toHaveLength(0);
    });

    it('does not throw when an app has no monitors array at all', () => {
        const component = load(makeNode({ apps: [makeApp({})] }));
        expect(component.allRows).toHaveLength(0);
    });

    it('sets a load error and stops loading when the portfolio fetch fails', () => {
        dashboardService.getPortfolio.mockReturnValue(throwError(() => new Error('network down')));
        const component = new FiringMonitorsPageComponent(makeRoute(), router, dashboardService);

        component.ngOnInit();

        expect(component.loadError).toBe('Unable to load firing monitors from the backend.');
        expect(component.isLoading).toBe(false);
    });

    it('goBack navigates to /dashboard', () => {
        const component = load(makeNode({}));
        component.goBack();
        expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('firingDuration renders "—" when lastTriggeredAt is missing', () => {
        const component = load(makeNode({}));
        expect(
            component.firingDuration({
                monitorId: 1,
                name: 'm',
                state: 'alert',
                service: 'svc',
                appId: 'a',
                appName: 'App',
                lastTriggeredAt: null,
                monitorUrl: null,
            })
        ).toBe('—');
    });
});

describe('FiringMonitorsPageComponent — deep-link rendering (US-2.4, AC4)', () => {
    let fixture: ComponentFixture<FiringMonitorsPageComponent>;
    let dashboardService: MockProxy<DashboardService>;

    /**
     * Renders the standalone component via TestBed against the given portfolio/query.
     * @param portfolio
     * @param query
     */
    function render(portfolio: PortfolioNode, query: Record<string, string> = {}): void {
        dashboardService = mock<DashboardService>();
        dashboardService.getPortfolio.mockReturnValue(of(portfolio));

        TestBed.configureTestingModule({
            imports: [FiringMonitorsPageComponent],
            providers: [
                { provide: DashboardService, useValue: dashboardService },
                { provide: ActivatedRoute, useValue: makeRoute(query) },
                { provide: Router, useValue: mock<Router>() },
            ],
        });
        fixture = TestBed.createComponent(FiringMonitorsPageComponent);
        fixture.detectChanges();
    }

    it('renders a real <a target="_blank" rel="noopener noreferrer"> when monitorUrl is present', () => {
        const app = makeApp({
            monitors: [
                makeMonitor({
                    id: 1,
                    datadogState: 'Alert',
                    status: 'RED',
                    monitorUrl: 'https://app.datadoghq.com/monitors/1',
                }),
            ],
        });
        render(makeNode({ apps: [app] }));

        const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a.fm-mon-link');
        expect(link).toBeTruthy();
        expect(link?.getAttribute('href')).toBe('https://app.datadoghq.com/monitors/1');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders non-clickable text (no <a>) when monitorUrl is absent (pre-backfill)', () => {
        const app = makeApp({
            monitors: [makeMonitor({ id: 1, datadogState: 'Warn', status: 'AMBER' })],
        });
        render(makeNode({ apps: [app] }));

        expect(fixture.nativeElement.querySelector('a.fm-mon-link')).toBeNull();
        expect(fixture.nativeElement.textContent).toContain('Monitor');
    });

    it('renders the all-clear card when nothing is firing in scope', () => {
        render(makeNode({ apps: [makeApp({ monitors: [] })], name: 'Everything OK' }));

        expect(fixture.nativeElement.querySelector('.rec-all-passing')).toBeTruthy();
        expect(fixture.nativeElement.textContent).toContain('All clear');
        expect(fixture.nativeElement.textContent).toContain('Everything OK');
    });

    it('renders the no-results-from-filter state with a Clear filters control', () => {
        const app = makeApp({
            monitors: [
                makeMonitor({ id: 1, datadogState: 'Alert', status: 'RED', service: 'svc-a' }),
            ],
        });
        render(makeNode({ apps: [app] }), { service: 'svc-that-does-not-exist' });

        expect(fixture.nativeElement.querySelector('.fm-no-results')).toBeTruthy();
        expect(fixture.nativeElement.textContent).toContain('No monitors match these filters.');
    });
});
