import { Controller, Get, Param } from '@nestjs/common';

import {
    DashboardDetailResponse,
    DashboardSummary,
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
     * @returns {Promise<object>} dashboard portfolio tree
     */
    @Get('portfolio')
    async getPortfolio(): Promise<PortfolioNode> {
        return this.dashboardService.getPortfolio();
    }

    /**
     * Returns the portfolio-backed detail context for a single application.
     * @param {string} id - portfolio application id
     * @returns {Promise<object>} application context and owning path
     */
    @Get('portfolio/apps/:id')
    async getAppContext(@Param('id') id: string): Promise<PortfolioAppContext> {
        return this.dashboardService.getAppContext(id);
    }

    /**
     * Returns the full detail-screen payload for a portfolio application.
     * @param {string} id - portfolio application id
     * @returns {Promise<object>} detail-screen payload
     */
    @Get('portfolio/apps/:id/detail')
    async getAppDetail(@Param('id') id: string): Promise<DashboardDetailResponse> {
        return this.dashboardService.getAppDetail(id);
    }

    /**
     * Returns aggregate dashboard metrics.
     * @returns {Promise<object>} dashboard summary metrics
     */
    @Get('summary')
    async getSummary(): Promise<DashboardSummary> {
        return this.dashboardService.getSummary();
    }
}
