import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import LOCAL_DEVELOPMENT_USER from '@operational-dashboard/shared-api-model/model/common/LocalDevelopmentUser';
import {
    DashboardDetailChannelOption,
    DashboardDetailNotifyOption,
    DashboardDetailPeople,
    DashboardDetailResponse,
    HealthHistoryResponse,
    RecommendationResult,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardDataModeService from './dashboard-data-mode.service';
import DashboardScopeService from './dashboard-scope.service';
import environment from '../../../../environments/environment';
import { Application, DashboardSummary, Incident, Contact } from '../models/dashboard.models';
import { PORTFOLIO_DATA } from '../models/portfolio.data';
import { PortfolioAppContext, PortfolioNode } from '../models/portfolio.model';
import {
    buildDemoRecommendations,
    createDetailView,
    createFallbackApp,
    findAppContext,
    PEOPLE,
} from '../pages/detail-page/detail-page.data';

@Injectable({
    providedIn: 'root',
})
export default class DashboardService {
    private baseUrl = environment.apiBaseUrl;

    /**
     * Creates the dashboard API client.
     * @param {object} http - HTTP client for backend requests
     * @param dataModeService
     * @param scopeService
     */
    constructor(
        private http: HttpClient,
        private dataModeService: DashboardDataModeService,
        private scopeService: DashboardScopeService
    ) {}

    /**
     * Query params used to scope portfolio results. Returns `scope=mine` when the
     * user has chosen "My Applications"; otherwise empty (all applications).
     * @returns {object} query parameters for the dashboard API
     */
    private scopeParams(): Record<string, string> {
        return this.scopeService.currentScope === 'mine' ? { scope: 'mine' } : {};
    }

    /**
     * Fetches applications using optional dashboard filters.
     * @param {object} params - optional application filters
     * @param {string} [params.status] - health status filter
     * @param {number} [params.tier] - application tier filter
     * @param {string} [params.businessUnit] - business unit filter
     * @param {string} [params.search] - free-text search term
     * @returns {object} matching applications
     */
    getApplications(params?: {
        status?: string;
        tier?: number;
        businessUnit?: string;
        search?: string;
    }): Observable<Application[]> {
        const queryParams: Record<string, string> = {};
        if (params?.status) queryParams.status = params.status;
        if (params?.tier) queryParams.tier = String(params.tier);
        if (params?.businessUnit) queryParams.businessUnit = params.businessUnit;
        if (params?.search) queryParams.search = params.search;

        return this.http.get<Application[]>(`${this.baseUrl}/applications`, {
            params: queryParams,
        });
    }

    /**
     * Fetches a single application by id.
     * @param {string} id - application id
     * @returns {object} application details
     */
    getApplication(id: string): Observable<Application> {
        return this.http.get<Application>(`${this.baseUrl}/applications/${id}`);
    }

    /**
     * Fetches the dashboard summary metrics.
     * @returns {object} dashboard summary response
     */
    getSummary(): Observable<DashboardSummary> {
        if (this.dataModeService.currentMode === 'demo') {
            const apps = this.getAllDemoApps();
            const uptimeApps = apps.filter((app) => app.uptime !== null);
            const overallUptime30d = uptimeApps.length
                ? Number(
                      (
                          uptimeApps.reduce((total, app) => total + (app.uptime || 0), 0) /
                          uptimeApps.length
                      ).toFixed(2)
                  )
                : 0;

            return of({
                totalApplications: apps.length,
                greenCount: apps.filter((app) => app.health === 'green').length,
                amberCount: apps.filter((app) => app.health === 'amber').length,
                redCount: apps.filter((app) => app.health === 'red').length,
                totalActiveUsers: apps.reduce((total, app) => total + (app.activeUsers || 0), 0),
                overallUptime30d,
            });
        }

        return this.http.get<DashboardSummary>(`${this.baseUrl}/dashboard/summary`, {
            params: this.scopeParams(),
        });
    }

    /**
     * Fetches the portfolio tree used by the dashboard page.
     * @returns {object} dashboard portfolio tree
     */
    getPortfolio(): Observable<PortfolioNode> {
        if (this.dataModeService.currentMode === 'demo') {
            return of(DashboardService.cloneValue(PORTFOLIO_DATA));
        }

        return this.http.get<PortfolioNode>(`${this.baseUrl}/dashboard/portfolio`, {
            params: this.scopeParams(),
        });
    }

    /**
     * Fetches the detail context for a portfolio application.
     * @param {string} id - portfolio application id
     * @returns {object} application detail context
     */
    getPortfolioAppContext(id: string): Observable<PortfolioAppContext> {
        if (this.dataModeService.currentMode === 'demo') {
            return of(DashboardService.getDemoAppContext(id));
        }

        return this.http.get<PortfolioAppContext>(
            `${this.baseUrl}/dashboard/portfolio/apps/${encodeURIComponent(id)}`
        );
    }

    /**
     * Fetches the full detail-screen payload for a portfolio application.
     * @param {string} id - portfolio application id
     * @returns {object} detail-screen response
     */
    getPortfolioAppDetail(id: string): Observable<DashboardDetailResponse> {
        if (this.dataModeService.currentMode === 'demo') {
            const detailResponse: DashboardDetailResponse = {
                view: createDetailView(
                    DashboardService.getDemoAppContext(id)
                ) as unknown as DashboardDetailResponse['view'],
                people: DashboardService.getDemoPeople(),
            };

            return of(detailResponse);
        }

        return this.http.get<DashboardDetailResponse>(
            `${this.baseUrl}/dashboard/portfolio/apps/${encodeURIComponent(id)}/detail`
        );
    }

    /**
     * Fetches the append-only Health timeline for a portfolio application (FR-3).
     * Demo mode keeps the seeded showcase bars, so it returns an empty series.
     * @param {string} id - portfolio application id
     * @returns {object} Health history series, newest first
     */
    getHealthHistory(id: string): Observable<HealthHistoryResponse> {
        if (this.dataModeService.currentMode === 'demo') {
            return of({ applicationId: id, points: [] });
        }

        return this.http.get<HealthHistoryResponse>(
            `${this.baseUrl}/dashboard/portfolio/apps/${encodeURIComponent(id)}/health-history`
        );
    }

    /**
     * Fetches grounded maturity recommendations for an application (12-x). Loaded
     * on demand from the detail page, never auto-generated. Demo mode derives the
     * cards from the seeded app's maturity so the tab stays honest off real data.
     * @param {string} id - portfolio application id
     * @param {boolean} refresh - true to bust the server cache ("Regenerate")
     * @returns {object} grounded, ranked recommendation payload
     */
    getRecommendations(id: string, refresh = false): Observable<RecommendationResult> {
        if (this.dataModeService.currentMode === 'demo') {
            return of(buildDemoRecommendations(DashboardService.getDemoAppContext(id).app));
        }

        const params: Record<string, string> = refresh ? { refresh: '1' } : {};

        return this.http.get<RecommendationResult>(
            `${this.baseUrl}/dashboard/portfolio/apps/${encodeURIComponent(id)}/recommendations`,
            { params }
        );
    }

    /**
     * Fetches incidents using optional filters.
     * @param {object} params - optional incident filters
     * @param {string} [params.status] - incident status filter
     * @param {string} [params.severity] - incident severity filter
     * @param {string} [params.applicationId] - application identifier filter
     * @returns {object} matching incidents
     */
    getIncidents(params?: {
        status?: string;
        severity?: string;
        applicationId?: string;
    }): Observable<Incident[]> {
        const queryParams: Record<string, string> = {};
        if (params?.status) queryParams.status = params.status;
        if (params?.severity) queryParams.severity = params.severity;
        if (params?.applicationId) queryParams.applicationId = params.applicationId;

        return this.http.get<Incident[]>(`${this.baseUrl}/incidents`, { params: queryParams });
    }

    /**
     * Creates a new incident for an application.
     * @param {object} incident - incident payload to submit
     * @param {string} incident.applicationId - application identifier
     * @param {string} incident.severity - incident severity
     * @param {string} incident.title - incident title
     * @param {string} incident.description - incident description
     * @param {string} incident.businessImpactLevel - business impact level
     * @param {number} incident.estimatedUsersImpacted - estimated impacted users
     * @param {string} incident.reportedBy - reporting user
     * @returns {object} created incident record
     */
    createIncident(incident: {
        applicationId: string;
        severity: string;
        title: string;
        description: string;
        businessImpactLevel: string;
        estimatedUsersImpacted: number;
        reportedBy: string;
    }): Observable<Incident> {
        return this.http.post<Incident>(`${this.baseUrl}/incidents`, incident);
    }

    /**
     * Fetches contacts for a team.
     * @param {string} teamId - team identifier
     * @returns {object} team contacts
     */
    getContacts(teamId: string): Observable<Contact[]> {
        return this.http.get<Contact[]>(`${this.baseUrl}/teams/${teamId}/contacts`);
    }

    /**
     * Applies a manual status override to an application.
     * @param {string} applicationId - application identifier
     * @param {object} override - override payload
     * @param {string} override.status - override status value
     * @param {string} override.overriddenBy - override author
     * @param {string} override.reason - override reason
     * @returns {object} updated application
     */
    setStatusOverride(
        applicationId: string,
        override: { status: string; overriddenBy: string; reason: string }
    ): Observable<Application> {
        return this.http.put<Application>(
            `${this.baseUrl}/applications/${applicationId}/status-override`,
            override
        );
    }

    /**
     * Removes a manual status override from an application.
     * @param {string} applicationId - application identifier
     * @returns {object} updated application
     */
    clearStatusOverride(applicationId: string): Observable<Application> {
        return this.http.delete<Application>(
            `${this.baseUrl}/applications/${applicationId}/status-override`
        );
    }

    /**
     *
     * @param id
     */
    private static getDemoAppContext(id: string): PortfolioAppContext {
        const portfolio = DashboardService.cloneValue(PORTFOLIO_DATA);
        const context = findAppContext(id, portfolio);

        if (context) {
            return context;
        }

        return {
            app: createFallbackApp(id),
            path: [portfolio],
        };
    }

    /**
     *
     */
    private static getDemoPeople(): DashboardDetailPeople {
        return {
            currentUser: {
                email: environment.bypassAuth ? LOCAL_DEVELOPMENT_USER.email : '',
                initials: PEOPLE.currentUser.initials,
                name: PEOPLE.currentUser.name,
                role: PEOPLE.currentUser.role,
            },
            sev1Notify: PEOPLE.sev1Notify.map<DashboardDetailNotifyOption>((option) => ({
                ...option,
            })),
            sev1Channels: PEOPLE.sev1Channels.map<DashboardDetailChannelOption>((option) => ({
                ...option,
            })),
        };
    }

    /**
     *
     */
    private getAllDemoApps(): PortfolioAppContext['app'][] {
        return this.collectApps(DashboardService.cloneValue(PORTFOLIO_DATA));
    }

    /**
     *
     * @param node
     */
    private collectApps(node: PortfolioNode): PortfolioAppContext['app'][] {
        return [
            ...(node.apps || []),
            ...(node.children || []).flatMap((child) => this.collectApps(child)),
        ];
    }

    /**
     *
     * @param value
     */
    private static cloneValue<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T;
    }
}
