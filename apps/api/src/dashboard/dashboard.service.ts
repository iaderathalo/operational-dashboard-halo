import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    DashboardDetailResponse,
    DashboardSummary,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioNode } from './portfolio.model';
import { PortfolioRepository } from './portfolio.repository';
import ApplicationsService from '../applications/applications.service';

@Injectable()
export default class DashboardService {
    /**
     * Creates the dashboard service.
     * @param {object} applicationsService - service for application-level queries
     * @param {object} portfolioRepository - repository for dashboard portfolio data
     * @param {object} logger - Polaris logger instance
     */
    constructor(
        private readonly applicationsService: ApplicationsService,
        @Inject('PortfolioRepository')
        private readonly portfolioRepository: PortfolioRepository,
        private logger: Logger
    ) {}

    /**
     * Returns the portfolio tree that powers the dashboard page.
     * @param {string} [userEmail] - optional user email used to scope the portfolio
     * @returns {Promise<object>} dashboard portfolio tree
     */
    async getPortfolio(userEmail?: string): Promise<PortfolioNode> {
        this.logger.info('Retrieving dashboard portfolio');
        return this.portfolioRepository.getPortfolio(userEmail);
    }

    /**
     * Returns the detail context for a single application in the portfolio tree.
     * @param {string} appId - portfolio application id
     * @param {string} [userEmail] - optional user email used to scope the portfolio
     * @returns {Promise<object>} application context and owning path
     */
    async getAppContext(appId: string, userEmail?: string): Promise<PortfolioAppContext> {
        this.logger.info(`Retrieving dashboard app context for [${appId}]`);

        const context = await this.portfolioRepository.getAppContext(appId, userEmail);

        if (!context) {
            throw new NotFoundException(`Dashboard application [${appId}] not found`);
        }

        return context;
    }

    /**
     * Returns the full detail-screen payload for a portfolio application.
     * @param {string} appId - portfolio application id
     * @param {string} [userEmail] - optional user email used to scope the portfolio
     * @returns {Promise<object>} dashboard detail payload
     */
    async getAppDetail(appId: string, userEmail?: string): Promise<DashboardDetailResponse> {
        this.logger.info(`Retrieving dashboard app detail for [${appId}]`);
        const detail = await this.portfolioRepository.getAppDetail(appId, userEmail);

        if (!detail) {
            throw new NotFoundException(`Dashboard application [${appId}] not found`);
        }

        return detail;
    }

    /**
     * Calculates the summary metrics for the dashboard overview.
     * @param {string} [userEmail] - optional user email used to scope the summary
     * @returns {Promise<object>} aggregate dashboard summary
     */
    async getSummary(userEmail?: string): Promise<DashboardSummary> {
        this.logger.info('Generating dashboard summary');
        const apps = await this.applicationsService.findAll(undefined, userEmail);

        const greenCount = apps.filter((a) => a.currentStatus === 'GREEN').length;
        const amberCount = apps.filter((a) => a.currentStatus === 'AMBER').length;
        const redCount = apps.filter((a) => a.currentStatus === 'RED').length;
        const totalActiveUsers = apps.reduce((sum, a) => sum + (a.currentUserCount || 0), 0);

        return {
            totalApplications: apps.length,
            greenCount,
            amberCount,
            redCount,
            totalActiveUsers,
            overallUptime30d: 99.7,
        };
    }
}
