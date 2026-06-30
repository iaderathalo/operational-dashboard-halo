import { HttpClientTestingModule } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { PortfolioSearchResult } from '@operational-dashboard/shared-api-model/model/dashboard';

import AppSearchComponent from './app-search.component';
import DashboardScopeService, { DashboardScope } from '../../services/dashboard-scope.service';
import DashboardService from '../../services/dashboard.service';

/**
 * Minimal rich result fixture used across tests.
 * @param overrides
 */
const makeResult = (overrides: Partial<PortfolioSearchResult> = {}): PortfolioSearchResult => ({
    id: '1',
    name: 'Mercer Compass',
    shortCode: 'MCPS',
    health: 'green',
    opCo: 'Mercer',
    businessUnit: 'Digital',
    lob: 'Platform',
    ...overrides,
});

interface ScopeServiceStub {
    currentScope: DashboardScope;
    scope$: Observable<DashboardScope>;
}

describe('AppSearchComponent', () => {
    let component: AppSearchComponent;
    let searchAppsMock: jest.Mock;
    let router: Router;
    let scopeServiceStub: ScopeServiceStub;

    beforeEach(async () => {
        searchAppsMock = jest.fn().mockReturnValue(of([]));
        scopeServiceStub = {
            currentScope: 'all' as DashboardScope,
            scope$: of('all' as DashboardScope),
        };

        await TestBed.configureTestingModule({
            imports: [AppSearchComponent, RouterTestingModule, HttpClientTestingModule],
            providers: [
                {
                    provide: DashboardService,
                    useValue: { searchApps: searchAppsMock },
                },
                {
                    provide: DashboardScopeService,
                    useValue: scopeServiceStub,
                },
            ],
        }).compileComponents();

        const fixture = TestBed.createComponent(AppSearchComponent);
        component = fixture.componentInstance;
        router = TestBed.inject(Router);
        fixture.detectChanges();
    });

    afterEach(() => {
        component.ngOnDestroy();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    // ─── B1: 3-char minimum ─────────────────────────────────────────────────

    it('does not call searchApps when query is 1 character', fakeAsync(() => {
        const inputEvent = { target: { value: 'm' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);
        expect(searchAppsMock).not.toHaveBeenCalled();
    }));

    it('does not call searchApps when query is 2 characters (3-char minimum)', fakeAsync(() => {
        const inputEvent = { target: { value: 'me' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);
        expect(searchAppsMock).not.toHaveBeenCalled();
    }));

    it('calls searchApps and populates results after debounce for 3+ char query', fakeAsync(() => {
        const mockResults = [makeResult()];
        searchAppsMock.mockReturnValue(of(mockResults));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        expect(searchAppsMock).toHaveBeenCalledWith('mer');
        expect(component.results).toHaveLength(1);
        expect(component.isOpen).toBe(true);
    }));

    // ─── A3: loading / no-results state ─────────────────────────────────────

    it('sets loading=true and isOpen=true immediately on 3-char input (before debounce)', () => {
        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);

        expect(component.loading).toBe(true);
        expect(component.isOpen).toBe(true);
        expect(component.statusMessage).toBe('Loading…');
    });

    it('clears loading, isOpen, results immediately when input drops below 3 chars', () => {
        const threeChar = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(threeChar);
        expect(component.loading).toBe(true);

        const twoChar = { target: { value: 'me' } } as unknown as Event;
        component.onInput(twoChar);

        expect(component.loading).toBe(false);
        expect(component.isOpen).toBe(false);
        expect(component.results).toEqual([]);
        expect(component.statusMessage).toBe('');
    });

    it('sets the statusMessage after results arrive', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([makeResult()]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        expect(component.statusMessage).toBe('1 application found.');
    }));

    it('sets a no-match statusMessage when results are empty', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([]));

        const inputEvent = { target: { value: 'zzz' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        expect(component.statusMessage).toMatch(/No applications match 'zzz'/);
        expect(component.isOpen).toBe(true);
    }));

    // ─── A4: error state ─────────────────────────────────────────────────────

    it('sets error=true and keeps the pipeline alive on a service error', fakeAsync(() => {
        searchAppsMock.mockReturnValue(throwError(() => new Error('network error')));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        expect(component.error).toBe(true);
        expect(component.loading).toBe(false);
        // Pipeline must remain alive — a subsequent query should still work
        searchAppsMock.mockReturnValue(of([makeResult()]));
        const inputEvent2 = { target: { value: 'merc' } } as unknown as Event;
        component.onInput(inputEvent2);
        tick(300);
        expect(component.error).toBe(false);
        expect(component.results).toHaveLength(1);
    }));

    // ─── A1: ARIA attributes ─────────────────────────────────────────────────

    it('exposes aria-expanded=false when the dropdown is closed', () => {
        expect(component.isOpen).toBe(false);
    });

    it('sets activeIndex correctly so aria-activedescendant can be derived', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([makeResult(), makeResult({ id: '2', name: 'App 2' })]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        expect(component.activeIndex).toBe(-1);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(component.activeIndex).toBe(0);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(component.activeIndex).toBe(1);
    }));

    // ─── A2: keyboard contract ───────────────────────────────────────────────

    it('ArrowDown re-opens the dropdown when closed and query is ≥3 chars', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([makeResult()]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);
        component.closeDropdown(); // close it
        expect(component.isOpen).toBe(false);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(component.isOpen).toBe(true);
    }));

    it('ArrowUp from index 0 goes back to input (activeIndex = -1)', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([makeResult()]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        expect(component.activeIndex).toBe(0);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        expect(component.activeIndex).toBe(-1);
    }));

    it('Escape (first press): closes dropdown but keeps the typed query', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([makeResult()]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);
        expect(component.isOpen).toBe(true);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));

        expect(component.isOpen).toBe(false);
        expect(component.query).toBe('mer'); // query preserved
    }));

    it('Escape (second press): clears the query when dropdown already closed', fakeAsync(() => {
        searchAppsMock.mockReturnValue(of([makeResult()]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' })); // close dropdown
        component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' })); // clear query

        expect(component.query).toBe('');
    }));

    it('Enter with no active item closes the dropdown without navigating', fakeAsync(() => {
        const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
        searchAppsMock.mockReturnValue(of([makeResult()]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

        expect(navigateSpy).not.toHaveBeenCalled();
        expect(component.isOpen).toBe(false);
    }));

    // ─── Navigation ──────────────────────────────────────────────────────────

    it('navigates to the detail page on selectResult and clears the search', () => {
        const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
        const result = makeResult({ id: '42' });
        component.results = [result];
        component.isOpen = true;

        component.selectResult(result);

        expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/app', '42']);
        expect(component.isOpen).toBe(false);
        expect(component.query).toBe('');
    });

    it('navigates on Enter when an item is active', fakeAsync(() => {
        const navigateSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
        searchAppsMock.mockReturnValue(of([makeResult({ id: '99', name: 'My App' })]));

        const inputEvent = { target: { value: 'mya' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

        expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/app', '99']);
    }));

    // ─── B2: rich result shape ───────────────────────────────────────────────

    it('result objects carry health, opCo, businessUnit, lob fields', fakeAsync(() => {
        const richResult = makeResult();
        searchAppsMock.mockReturnValue(of([richResult]));

        const inputEvent = { target: { value: 'mer' } } as unknown as Event;
        component.onInput(inputEvent);
        tick(300);

        const [res] = component.results;
        expect(res.health).toBe('green');
        expect(res.opCo).toBe('Mercer');
        expect(res.businessUnit).toBe('Digital');
        expect(res.lob).toBe('Platform');
    }));

    // ─── B3: scope-aware placeholder ────────────────────────────────────────

    it('shows "Search all applications…" when scope is all', () => {
        expect(component.placeholder).toBe('Search all applications…');
    });

    it('shows "Search my applications…" when scope is mine', async () => {
        const mineScopeStub = {
            currentScope: 'mine' as const,
            scope$: of('mine' as const),
        };

        await TestBed.resetTestingModule()
            .configureTestingModule({
                imports: [AppSearchComponent, RouterTestingModule, HttpClientTestingModule],
                providers: [
                    { provide: DashboardService, useValue: { searchApps: searchAppsMock } },
                    { provide: DashboardScopeService, useValue: mineScopeStub },
                ],
            })
            .compileComponents();

        const fixture = TestBed.createComponent(AppSearchComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();

        expect(comp.placeholder).toBe('Search my applications…');
        comp.ngOnDestroy();
    });

    // ─── searchAll affordance ────────────────────────────────────────────────

    it('searchAll calls searchApps with allScope=true and repopulates results', fakeAsync(() => {
        const allResults = [makeResult({ id: 'all-1', name: 'All App' })];
        searchAppsMock.mockReturnValue(of(allResults));

        component.query = 'mer';
        component.searchAll();
        tick();

        expect(searchAppsMock).toHaveBeenCalledWith('mer', true);
        expect(component.results).toEqual(allResults);
        expect(component.isOpen).toBe(true);
    }));

    it('searchAll does nothing when query is shorter than 3 chars', () => {
        component.query = 'me';
        component.searchAll();
        expect(searchAppsMock).not.toHaveBeenCalled();
    });

    // ─── currentScope getter ─────────────────────────────────────────────────

    it('exposes currentScope from the scope service', () => {
        expect(component.currentScope).toBe('all');
    });
});
