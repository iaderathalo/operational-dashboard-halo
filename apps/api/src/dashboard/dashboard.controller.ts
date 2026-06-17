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
     * Returns the full portfolio tree for the dashboard page.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @returns {Promise<object>} dashboard portfolio tree
     */
    @Get('portfolio')
    async getPortfolio(@Req() request: { user?: { email?: string } }): Promise<PortfolioNode> {
        return this.dashboardService.getPortfolio(request.user?.email);
    }

    /**
     * Returns the portfolio-backed detail context for a single application.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @returns {Promise<object>} application context and owning path
     */
    @Get('portfolio/apps/:id')
    async getAppContext(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string
    ): Promise<PortfolioAppContext> {
        return this.dashboardService.getAppContext(id, request.user?.email);
    }

    /**
     * Returns the full detail-screen payload for a portfolio application.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @returns {Promise<object>} detail-screen payload
     */
    @Get('portfolio/apps/:id/detail')
    async getAppDetail(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string
    ): Promise<DashboardDetailResponse> {
        return this.dashboardService.getAppDetail(id, request.user?.email);
    }

    /**
     * Returns the append-only Health timeline for a portfolio application (FR-3).
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the portfolio
     * @param {string} id - portfolio application identifier
     * @param {string} [limit] - optional cap on the number of records returned
     * @returns {Promise<object>} Health history series, newest first
     */
    @Get('portfolio/apps/:id/health-history')
    async getAppHealthHistory(
        @Req() request: { user?: { email?: string } },
        @Param('id') id: string,
        @Query('limit') limit?: string
    ): Promise<HealthHistoryResponse> {
        return this.dashboardService.getHealthHistory(
            id,
            request.user?.email,
            limit ? Number(limit) : undefined
        );
    }

    /**
     * Returns aggregate dashboard metrics.
     * @param {object} request - authenticated request wrapper
     * @param {object} [request.user] - authenticated user payload when present
     * @param {string} [request.user.email] - email used to scope the summary
     * @returns {Promise<object>} dashboard summary metrics
     */
    @Get('summary')
    async getSummary(@Req() request: { user?: { email?: string } }): Promise<DashboardSummary> {
        return this.dashboardService.getSummary(request.user?.email);
    }
}
