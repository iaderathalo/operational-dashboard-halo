import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DashboardScope = 'all' | 'mine';

@Injectable({
    providedIn: 'root',
})
export default class DashboardScopeService {
    private readonly storageKey = 'polaris-dashboard-scope';

    private readonly scopeSubject = new BehaviorSubject<DashboardScope>(this.loadInitialScope());

    readonly scope$ = this.scopeSubject.asObservable();

    /**
     *
     */
    get currentScope(): DashboardScope {
        return this.scopeSubject.value;
    }

    /**
     *
     * @param scope
     */
    setScope(scope: DashboardScope): void {
        if (this.scopeSubject.value === scope) {
            return;
        }

        this.scopeSubject.next(scope);
        this.persistScope(scope);
    }

    /**
     *
     */
    private loadInitialScope(): DashboardScope {
        if (typeof window === 'undefined') {
            return 'all';
        }

        return window.localStorage.getItem(this.storageKey) === 'mine' ? 'mine' : 'all';
    }

    /**
     *
     * @param scope
     */
    private persistScope(scope: DashboardScope): void {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(this.storageKey, scope);
    }
}
