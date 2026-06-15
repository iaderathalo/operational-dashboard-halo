import { HttpClient } from '@angular/common/http';
import { Component, HostListener, Injector } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { OKTA_CONFIG } from '@okta/okta-angular';
import { OktaAuth } from '@okta/okta-auth-js';
import { filter } from 'rxjs';

import LOCAL_DEVELOPMENT_USER from '@operational-dashboard/shared-api-model/model/common/LocalDevelopmentUser';

import environment from '../environments/environment';
import DashboardService from './features/dashboard/services/dashboard.service';
import DashboardDataModeService, {
    DashboardDataMode,
} from './features/dashboard/services/dashboard-data-mode.service';
import { PortfolioAppContext } from './features/dashboard/models/portfolio.model';

import('@mmctech/micro-lenai-webcomponent');

@Component({
    selector: 'polaris-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false,
})
export default class AppComponent {
    title = 'Portfolio Visibility Dashboard';

    appVersion = environment.appVersion;

    currentYear = new Date().getFullYear();

    oktaAuth: OktaAuth | null = null;

    apiUnreachable = false;

    apiError = false;

    isMenuOpen = false;

    showMicroLenAi = false;

    showFooter = false;

    dashboardTitle = 'Portfolio Visibility Dashboard';

    headerEnvironment = 'Production';

    headerUserName = environment.bypassAuth ? LOCAL_DEVELOPMENT_USER.name : 'Profile';

    headerUserEmail = environment.bypassAuth ? LOCAL_DEVELOPMENT_USER.email : '';

    headerUserUsername = environment.bypassAuth ? LOCAL_DEVELOPMENT_USER.email : '';

    headerUserRole = environment.bypassAuth ? LOCAL_DEVELOPMENT_USER.role : '';

    headerUserInitials = environment.bypassAuth ? LOCAL_DEVELOPMENT_USER.initials : 'P';

    headerUserAvatarUrl = '';

    isProfileMenuOpen = false;

    isDashboardRoute = false;

    headerDetailLabel = '';

    dataMode: DashboardDataMode;

    private pendingHeaderDetailId = '';

    microLenAiApiUrl =
        'https://nasa-micro-lenai.int.prd.dal.oss2.mrshmc.com/api/v1/mmcdocs/response';

    POLARIS_URL =
        'https://mmcglobal.sharepoint.com/sites/EnterpriseArchitecture/SitePages/Polaris.aspx';

    /**
     * Creates the root app component and initializes shell services.
     * @param {object} injector - service that provides the OktaAuth instance
     * @param {object} http - service for making HTTP requests
     * @param {object} router - service for route navigation and route state
     */
    constructor(
        public injector: Injector,
        private http: HttpClient,
        private router: Router,
        private dashboardService: DashboardService,
        private dataModeService: DashboardDataModeService
    ) {
        this.dataMode = this.dataModeService.currentMode;
        // the OktaAuth instance is not directly available through the constructor dependency injection. Use the injector instead
        this.oktaAuth = injector.get(OKTA_CONFIG, null)?.oktaAuth ?? null;
        this.loadHeaderUserProfile().catch(() => undefined);
        this.isAPILive();
        this.updateHeaderContext(this.router.url);
        this.router.events
            .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
            .subscribe((event) => {
                this.closeProfileMenu();
                this.updateHeaderContext(event.urlAfterRedirects);

                if (!this.headerUserEmail) {
                    this.loadHeaderUserProfile().catch(() => undefined);
                }
            });

        this.dataModeService.mode$.subscribe((mode) => {
            this.dataMode = mode;

            if (this.isDashboardRoute) {
                this.updateHeaderContext(this.router.url);
            }
        });
    }

    /**
     *
     */
    @HostListener('document:click')
    handleDocumentClick(): void {
        this.closeProfileMenu();
    }

    /**
     *
     */
    @HostListener('document:keydown.escape')
    handleEscapeKey(): void {
        this.closeProfileMenu();
    }

    /**
     * Check if API is up and running, updates the component state based on API response.
     */
    isAPILive(): void {
        const sub = this.http.get(`${environment.apiBaseUrl}/tasks`);
        sub.subscribe({
            next: () => {
                this.apiUnreachable = false;
                this.apiError = false;
            },
            error: (error) => {
                if (error.statusText === 'Unknown Error') this.apiUnreachable = true;
                if (error.statusText === 'Internal Server Error') this.apiError = true;
            },
        });
    }

    /**
     * Toggle Menu for Responsive Design
     */
    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    /**
     * Opens or closes the header profile dropdown.
     * @param {MouseEvent} event - click event from the profile trigger
     */
    toggleProfileMenu(event: MouseEvent): void {
        event.stopPropagation();
        this.isProfileMenuOpen = !this.isProfileMenuOpen;
    }

    /**
     * Closes the header profile dropdown.
     */
    closeProfileMenu(): void {
        this.isProfileMenuOpen = false;
    }

    /**
     * Switches the dashboard between real and demo data.
     * @param {DashboardDataMode} mode - selected dashboard data mode
     */
    setDataMode(mode: DashboardDataMode): void {
        this.dataModeService.setMode(mode);
    }

    /**
     * Updates the unified header context based on the active route.
     * @param {string} url - current route URL
     */
    updateHeaderContext(url: string): void {
        const normalizedUrl = url.split('?')[0].split('#')[0];
        const pathSegments = normalizedUrl.split('/').filter(Boolean);

        this.isDashboardRoute = pathSegments[0] === 'dashboard';
        this.headerDetailLabel = '';
        this.pendingHeaderDetailId = '';

        if (!this.isDashboardRoute) {
            return;
        }

        if (pathSegments[1] === 'app' && pathSegments[2]) {
            this.headerDetailLabel = 'Application Detail';
            this.loadHeaderDetailLabel(pathSegments[2]);
        }
    }

    /**
     * Loads the application label used in the dashboard shell header.
     * @param {string} appId - portfolio application id from the route
     */
    private loadHeaderDetailLabel(appId: string): void {
        this.pendingHeaderDetailId = appId;

        this.http;

        this.dashboardService.getPortfolioAppContext(appId).subscribe({
            next: (context) => {
                if (this.pendingHeaderDetailId === appId) {
                    this.headerDetailLabel = context.app.name || 'Application Detail';
                }
            },
            error: () => {
                if (this.pendingHeaderDetailId === appId) {
                    this.headerDetailLabel = 'Application Detail';
                }
            },
        });
    }

    /**
     * Loads the signed-in user's profile details for the dashboard header.
     */
    private async loadHeaderUserProfile(): Promise<void> {
        if (environment.bypassAuth) {
            return;
        }

        if (!this.oktaAuth) {
            return;
        }

        try {
            const claims = (await this.oktaAuth.getUser()) as Record<string, unknown>;
            const givenName = AppComponent.getClaimString(claims, ['given_name']);
            const familyName = AppComponent.getClaimString(claims, ['family_name']);
            const fullName = [givenName, familyName].filter(Boolean).join(' ').trim();
            const displayName =
                AppComponent.getClaimString(claims, ['name']) ||
                fullName ||
                AppComponent.getClaimString(claims, [
                    'preferred_username',
                    'login',
                    'email',
                    'sub',
                ]) ||
                'Profile';

            this.headerUserName = displayName;
            this.headerUserEmail = AppComponent.getClaimString(claims, ['email']);
            this.headerUserUsername = AppComponent.getClaimString(claims, [
                'preferred_username',
                'login',
                'email',
                'sub',
            ]);
            this.headerUserRole = AppComponent.getClaimString(claims, [
                'title',
                'job_title',
                'role',
            ]);
            this.headerUserAvatarUrl = AppComponent.getClaimString(claims, [
                'picture',
                'profile_picture',
                'avatar_url',
            ]);
            this.headerUserInitials = AppComponent.buildInitials(
                displayName,
                givenName,
                familyName
            );
        } catch {
            // Leave the header on its fallback state until the auth callback completes.
        }
    }

    /**
     * Returns the first non-empty string claim from the supplied keys.
     * @param {Record<string, unknown>} claims - Okta user claims
     * @param {string[]} keys - preferred claim names
     * @returns {string} first non-empty claim value or an empty string
     */
    private static getClaimString(claims: Record<string, unknown>, keys: string[]): string {
        return (
            keys
                .map((key) => claims[key])
                .find(
                    (value): value is string => typeof value === 'string' && value.trim().length > 0
                )
                ?.trim() || ''
        );
    }

    /**
     * Builds avatar initials from the available user name fields.
     * @param {string} displayName - display name shown in the header
     * @param {string} givenName - given name claim
     * @param {string} familyName - family name claim
     * @returns {string} initials for the fallback avatar badge
     */
    private static buildInitials(
        displayName: string,
        givenName: string,
        familyName: string
    ): string {
        if (givenName && familyName) {
            return `${givenName[0]}${familyName[0]}`.toUpperCase();
        }

        const parts = displayName.split(/\s+/).filter(Boolean).slice(0, 2);
        if (!parts.length) {
            return 'P';
        }

        return parts
            .map((part) => part[0])
            .join('')
            .toUpperCase();
    }
}
