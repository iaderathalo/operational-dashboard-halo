import { Controller, Get, Param, Query, Req } from '@nestjs/common';

import {
    DashboardDetailResponse,
    DashboardSummary,
    HealthHistoryResponse,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardService from './dashboard.service';
import { PortfolioAppContext, PortfolioNode } from './portfolio.model';

@Controller('dashboard')
export default class DashboardController {
    /**
     * Creates the dashboard controller.
     * @param {object} dashboardService - service for dashboard endpoints
     */
    constructor(private readonly dashboardService: DashboardService) {}

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
}
