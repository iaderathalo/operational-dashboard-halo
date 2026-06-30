import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';

import { PortfolioSearchResult } from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardNavStateService from '../../services/dashboard-nav-state.service';
import DashboardScopeService, { DashboardScope } from '../../services/dashboard-scope.service';
import DashboardService from '../../services/dashboard.service';

@Component({
    selector: 'polaris-app-search',
    templateUrl: './app-search.component.html',
    styleUrls: ['./app-search.component.scss'],
    standalone: true,
    imports: [CommonModule],
})
/**
 * Dashboard-level application typeahead: search by name or shortCode
 * (app_short_key) and navigate directly to the application detail page.
 * Respects the All / My Applications scope via DashboardService.searchApps.
 * Implements the W3C APG combobox pattern with a live region for screen readers.
 */
export default class AppSearchComponent implements OnInit, OnDestroy {
    query = '';

    results: PortfolioSearchResult[] = [];

    activeIndex = -1;

    isOpen = false;

    loading = false;

    error = false;

    /** Message surfaced to the `role="status"` live region for screen readers. */
    statusMessage = '';

    /** Placeholder text updated live from the active scope. */
    placeholder = 'Search all applications…';

    private readonly input$ = new Subject<string>();

    private subscription?: Subscription;

    private scopeSubscription?: Subscription;

    /**
     * Creates the app search component.
     * @param {object} dashboardService - service for portfolio search queries
     * @param {object} router - router for navigating to the selected app
     * @param {object} scopeService - service exposing the active portfolio scope
     * @param {object} navStateService - service for saving navigation state before leaving
     */
    constructor(
        private dashboardService: DashboardService,
        private router: Router,
        private scopeService: DashboardScopeService,
        private navStateService: DashboardNavStateService
    ) {}

    /** Returns the currently active portfolio scope. */
    get currentScope(): DashboardScope {
        return this.scopeService.currentScope;
    }

    /**
     * Wires the debounced search pipeline on init and subscribes to scope changes
     * to keep the placeholder and no-results affordance up to date.
     */
    ngOnInit(): void {
        this.placeholder = AppSearchComponent.placeholderFor(this.scopeService.currentScope);

        this.scopeSubscription = this.scopeService.scope$.subscribe((scope) => {
            this.placeholder = AppSearchComponent.placeholderFor(scope);
        });

        this.subscription = this.input$
            .pipe(
                debounceTime(250),
                distinctUntilChanged(),
                tap((q) => {
                    if (q.trim().length >= 3) {
                        this.loading = true;
                        this.error = false;
                        this.isOpen = true;
                        this.statusMessage = 'Loading…';
                    }
                }),
                switchMap((q) =>
                    q.trim().length < 3
                        ? of([])
                        : this.dashboardService.searchApps(q).pipe(
                              catchError(() => {
                                  this.error = true;
                                  this.loading = false;
                                  this.statusMessage = '';
                                  return of([]);
                              })
                          )
                )
            )
            .subscribe((results) => {
                this.results = results;
                this.activeIndex = -1;
                this.loading = false;

                if (this.query.trim().length >= 3) {
                    this.isOpen = true;
                    if (!this.error) {
                        if (results.length > 0) {
                            this.statusMessage = `${results.length} application${results.length === 1 ? '' : 's'} found.`;
                        } else {
                            this.statusMessage = `No applications match '${this.query.trim()}'.`;
                        }
                    }
                } else {
                    this.isOpen = false;
                    this.statusMessage = '';
                }
            });
    }

    /**
     * Tears down the search and scope subscriptions on destroy.
     */
    ngOnDestroy(): void {
        this.subscription?.unsubscribe();
        this.scopeSubscription?.unsubscribe();
    }

    /**
     * Handles input events from the search field. Sets loading state immediately
     * (before the debounce fires) for queries of 3+ characters.
     * @param {Event} event - the native input event
     */
    onInput(event: Event): void {
        const { value } = event.target as HTMLInputElement;
        this.query = value;

        if (value.trim().length >= 3) {
            this.loading = true;
            this.error = false;
            this.isOpen = true;
            this.statusMessage = 'Loading…';
        } else {
            this.loading = false;
            this.error = false;
            this.isOpen = false;
            this.statusMessage = '';
            this.results = [];
        }

        this.input$.next(value);
    }

    /**
     * Handles keyboard navigation per the W3C APG combobox pattern.
     * ArrowDown/Up move the active descendant; Enter selects or closes;
     * Escape uses a two-step: first close the dropdown (keeping the query),
     * then on a second press clear the query entirely.
     * @param {KeyboardEvent} event - the keyboard event
     */
    onKeydown(event: KeyboardEvent): void {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!this.isOpen && this.query.trim().length >= 3) {
                    // Re-open after a manual close (e.g. first Escape).
                    this.isOpen = true;
                } else if (this.isOpen && this.results.length > 0) {
                    this.activeIndex = Math.min(this.activeIndex + 1, this.results.length - 1);
                }
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (this.isOpen) {
                    // From index 0, move back to input (activeIndex = -1).
                    this.activeIndex = Math.max(this.activeIndex - 1, -1);
                }
                break;
            case 'Enter':
                if (this.activeIndex >= 0 && this.results[this.activeIndex]) {
                    this.selectResult(this.results[this.activeIndex]);
                } else {
                    this.closeDropdown();
                }
                break;
            case 'Escape':
                if (this.isOpen) {
                    // First Escape: close dropdown, keep the typed query.
                    this.closeDropdown();
                } else {
                    // Second Escape (or Escape when already closed): clear query.
                    this.query = '';
                    this.results = [];
                    this.statusMessage = '';
                }
                break;
            default:
                break;
        }
    }

    /**
     * Navigates to the selected application detail page and clears the search.
     * @param {PortfolioSearchResult} result - the selected search result
     */
    selectResult(result: PortfolioSearchResult): void {
        this.navStateService.setLastAppId(result.id);
        this.router.navigate(['/dashboard/app', result.id]);
        this.close();
    }

    /**
     * Re-runs the current query bypassing the active scope filter (all applications).
     * Shown as a one-click affordance in the no-results panel when scope is 'mine'.
     */
    searchAll(): void {
        if (this.query.trim().length < 3) {
            return;
        }
        this.loading = true;
        this.error = false;
        this.statusMessage = 'Loading…';
        this.dashboardService
            .searchApps(this.query, true)
            .pipe(
                catchError(() => {
                    this.error = true;
                    this.loading = false;
                    this.statusMessage = '';
                    return of([]);
                })
            )
            .subscribe((results) => {
                this.results = results;
                this.loading = false;
                this.isOpen = true;
                if (!this.error) {
                    this.statusMessage =
                        results.length > 0
                            ? `${results.length} application${results.length === 1 ? '' : 's'} found.`
                            : `No applications match '${this.query.trim()}'.`;
                }
            });
    }

    /**
     * Closes the dropdown and resets active index without clearing the typed query.
     * Used by the first Escape press and Enter with no active item.
     */
    closeDropdown(): void {
        this.isOpen = false;
        this.activeIndex = -1;
        this.statusMessage = '';
    }

    /**
     * Resets the entire search state: clears query, results, and closes the dropdown.
     */
    close(): void {
        this.query = '';
        this.results = [];
        this.activeIndex = -1;
        this.isOpen = false;
        this.loading = false;
        this.error = false;
        this.statusMessage = '';
    }

    /**
     * Returns the appropriate input placeholder for the given scope.
     * @param {DashboardScope} scope - current portfolio scope
     * @returns {string} placeholder string
     */
    private static placeholderFor(scope: DashboardScope): string {
        return scope === 'mine' ? 'Search my applications…' : 'Search all applications…';
    }
}
