import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DashboardDataMode = 'real' | 'demo';

@Injectable({
    providedIn: 'root',
})
export default class DashboardDataModeService {
    private readonly storageKey = 'polaris-dashboard-data-mode';

    private readonly modeSubject = new BehaviorSubject<DashboardDataMode>(this.loadInitialMode());

    readonly mode$ = this.modeSubject.asObservable();

    get currentMode(): DashboardDataMode {
        return this.modeSubject.value;
    }

    setMode(mode: DashboardDataMode): void {
        if (this.modeSubject.value === mode) {
            return;
        }

        this.modeSubject.next(mode);
        this.persistMode(mode);
    }

    private loadInitialMode(): DashboardDataMode {
        if (typeof window === 'undefined') {
            return 'real';
        }

        const storedMode = window.localStorage.getItem(this.storageKey);

        return storedMode === 'demo' ? 'demo' : 'real';
    }

    private persistMode(mode: DashboardDataMode): void {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(this.storageKey, mode);
    }
}
