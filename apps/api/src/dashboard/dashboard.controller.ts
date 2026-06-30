import { Controller, Get, Param, Query, Req } from '@nestjs/common';

import {
    DashboardDetailResponse,
    DashboardSummary,
    DigestSummary,
    HealthHistoryResponse,
    RecommendationResult,
    SnapshotMetadata,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardService from './dashboard.service';
import { PortfolioAppContext, PortfolioNode, PortfolioSearchResult } from './portfolio.model';
import RecommendationsService from '../recommendations/recommendations.service';

@Controller('dashboard')
export default class DashboardController {
    /**
     * Creates the dashboard controller.
     * @param {object} dashboardService - service for dashboard endpoints
     * @param {object} recommendationsService - service for grounded maturity recommendations
     */
    constructor(
        private readonly dashboardService: DashboardService,
        private readonly recommendationsService: RecommendationsService
    ) {}

    /**
     * Resolves the email used to scope results. The dashboard shows all
     * applications by default; `scope=mine` restricts results to the
     * applications the authenticated user owns.
     * @param {string} [scope] - 'mine' to scope by owner, otherwise unscoped
     * @param {string} [email] - the authenticated user's email
     * @returns {string | undefined} the email when scoping to owned apps, else undefined
     */
    private static scopedEmail(scope?: string, email?: string): string | undefined {
        return scope === 'mine' ? email : undefined;
    }

    /**
     * Returns the full portfolio tree for the dashboard page.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} dashboard portfolio tree
     */
    @Get('portfolio')
    async getPortfolio(
        @Req() request: { user?: { email?: string } },
        @Query('scope') scope?: string
    ): Promise<PortfolioNode> {
        return this.dashboardService.getPortfolio(
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }

    /**
     * Searches portfolio applications by app_short_key prefix or name for the
     * dashboard typeahead. Respects All / My Applications scope.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} [q] - search term
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<PortfolioSearchResult[]>} slim search results
     */
    @Get('portfolio/search')
    async searchApps(
        @Req() request: { user?: { email?: string } },
        @Query('q') q?: string,
        @Query('scope') scope?: string
    ): Promise<PortfolioSearchResult[]> {
        return this.dashboardService.searchApps(
            q ?? '',
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }

    /**
     * Returns the portfolio-backed detail context for a single application.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} application context and owning path
     */
    @Get('portfolio/apps/:id')
    async getAppContext(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string,
        @Query('scope') scope?: string
    ): Promise<PortfolioAppContext> {
        return this.dashboardService.getAppContext(
            id,
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }

    /**
     * Returns the full detail-screen payload for a portfolio application.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} detail-screen payload
     */
    @Get('portfolio/apps/:id/detail')
    async getAppDetail(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string,
        @Query('scope') scope?: string
    ): Promise<DashboardDetailResponse> {
        return this.dashboardService.getAppDetail(
            id,
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }

    /**
     * Returns the append-only Health timeline for a portfolio application (FR-3).
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @param {string} [limit] - optional cap on the number of records returned
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} Health history series, newest first
     */
    @Get('portfolio/apps/:id/health-history')
    async getAppHealthHistory(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string,
        @Query('limit') limit?: string,
        @Query('scope') scope?: string
    ): Promise<HealthHistoryResponse> {
        return this.dashboardService.getHealthHistory(
            id,
            DashboardController.scopedEmail(scope, request.user?.email),
            limit ? Number(limit) : undefined
        );
    }

    /**
     * Returns grounded, provider-agnostic maturity-remediation recommendations for an
     * application. Read-only and freshness-honest — never triggers a new Datadog call.
     * `refresh=1` busts the per-app cache (the UI "Regenerate").
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @param {string} [refresh] - '1' to bypass the cache
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} the grounded recommendation payload
     */
    @Get('portfolio/apps/:id/recommendations')
    async getAppRecommendations(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string,
        @Query('refresh') refresh?: string,
        @Query('scope') scope?: string
    ): Promise<RecommendationResult> {
        return this.recommendationsService.getRecommendations(
            id,
            DashboardController.scopedEmail(scope, request.user?.email),
            refresh === '1'
        );
    }

    /**
     * Returns aggregate dashboard metrics.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the summary
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} dashboard summary metrics
     */
    @Get('summary')
    async getSummary(
        @Req() request: { user?: { email?: string } },
        @Query('scope') scope?: string
    ): Promise<DashboardSummary> {
        return this.dashboardService.getSummary(
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }

    /**
     * 11-4: executive digest (portfolio roll-up, coverage %, freshness) from stored data.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the digest
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} the derived digest summary
     */
    @Get('digest')
    async getDigest(
        @Req() request: { user?: { email?: string } },
        @Query('scope') scope?: string
    ): Promise<DigestSummary> {
        return this.dashboardService.getDigest(
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }

    /**
     * 11-4: read-only, forwardable portfolio snapshot + freshness metadata. Reuses the
     * existing scope plumbing so a `mine` snapshot only contains the caller's own apps.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the snapshot
     * @param {string} [scope] - 'mine' to scope to owned apps, otherwise all
     * @returns {Promise<object>} the portfolio tree and snapshot metadata
     */
    @Get('snapshot')
    async getSnapshot(
        @Req() request: { user?: { email?: string } },
        @Query('scope') scope?: string
    ): Promise<{ portfolio: PortfolioNode; metadata: SnapshotMetadata }> {
        return this.dashboardService.getSnapshot(
            DashboardController.scopedEmail(scope, request.user?.email)
        );
    }
}
