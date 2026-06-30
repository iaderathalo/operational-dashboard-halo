import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    DashboardDetailResponse,
    DashboardSummary,
    DigestSummary,
    HealthHistoryResponse,
    SnapshotMetadata,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioNode, PortfolioSearchResult } from './portfolio.model';
import { PortfolioRepository } from './portfolio.repository';
import ApplicationsService from '../applications/applications.service';
import { HealthSnapshotRepository } from '../health-snapshots/health-snapshot.repository';

@Injectable()
export default class DashboardService {
    /** Default number of Health records returned by the timeline endpoint. */
    private static readonly DEFAULT_HEALTH_HISTORY_LIMIT = 500;

    /** Hard ceiling so a crafted `limit` cannot pull an unbounded series. */
    private static readonly MAX_HEALTH_HISTORY_LIMIT = 2000;

    /**
     * Creates the dashboard service.
     * @param {object} applicationsService - service for application-level queries
     * @param {object} portfolioRepository - repository for dashboard portfolio data
     * @param {object} healthSnapshots - repository for append-only Health records
     * @param {object} logger - Polaris logger instance
     */
    constructor(
        private readonly applicationsService: ApplicationsService,
        @Inject('PortfolioRepository')
        private readonly portfolioRepository: PortfolioRepository,
        @Inject('HealthSnapshotRepository')
        private readonly healthSnapshots: HealthSnapshotRepository,
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
     * Returns the append-only Health timeline for a single application (PRD FR-3).
     * Scoped through the portfolio so callers only read history for applications
     * they can already see; unknown or out-of-scope ids resolve to a 404.
     * @param {string} appId - portfolio application id
     * @param {string} [userEmail] - optional user email used to scope the portfolio
     * @param {number} [limit] - optional cap on the number of records returned
     * @returns {Promise<object>} the Health history series, newest first
     */
    async getHealthHistory(
        appId: string,
        userEmail?: string,
        limit?: number
    ): Promise<HealthHistoryResponse> {
        this.logger.info(`Retrieving health history for [${appId}]`);

        const context = await this.portfolioRepository.getAppContext(appId, userEmail);

        if (!context) {
            throw new NotFoundException(`Dashboard application [${appId}] not found`);
        }

        const points = await this.healthSnapshots.findRecentByApplicationId(
            appId,
            DashboardService.clampHistoryLimit(limit)
        );

        return { applicationId: appId, points };
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

    /**
     * 11-4: executive weekly digest, derived purely from the stored portfolio (no new
     * Datadog call). Honors All / My Applications scope.
     * @param {string} [userEmail] - optional email used to scope to owned apps
     * @returns {Promise<object>} the derived digest summary
     */
    async getDigest(userEmail?: string): Promise<DigestSummary> {
        this.logger.info('Generating executive digest');
        return this.portfolioRepository.getDigest(userEmail);
    }

    /**
     * 11-4: read-only, forwardable snapshot of the portfolio view as of now, plus a
     * freshness stamp. Re-derives from the SAME scoped set the caller can already see,
     * so a `mine`-scoped snapshot never leaks another owner's apps.
     * @param {string} [userEmail] - optional email used to scope to owned apps
     * @returns {Promise<object>} the portfolio tree plus snapshot metadata
     */
    async getSnapshot(
        userEmail?: string
    ): Promise<{ portfolio: PortfolioNode; metadata: SnapshotMetadata }> {
        this.logger.info('Generating shareable portfolio snapshot');

        const [portfolio, digest] = await Promise.all([
            this.portfolioRepository.getPortfolio(userEmail),
            this.portfolioRepository.getDigest(userEmail),
        ]);

        return {
            portfolio,
            metadata: {
                generatedAt: digest.generatedAt,
                scope: userEmail ? 'mine' : 'all',
                freshness: digest.freshness,
                appCount: digest.rollup.appCount,
            },
        };
    }

    /**
     * Searches portfolio applications by shortCode prefix or name for the
     * dashboard typeahead. Queries are scoped to the OpCo allowlist and,
     * when scope=mine, to the caller's owned apps. Returns [] for short queries.
     * @param {string} q - search term (minimum 2 chars)
     * @param {string} [userEmail] - optional email used to scope to owned apps
     * @returns {Promise<PortfolioSearchResult[]>} slim search results, at most 20
     */
    async searchApps(q: string, userEmail?: string): Promise<PortfolioSearchResult[]> {
        this.logger.info(`Searching portfolio apps for [${q}]`);
        return this.portfolioRepository.searchApps(q, userEmail);
    }

    /**
     * Normalizes the requested history size into a safe, bounded value.
     * @param {number} [limit] - caller-supplied record cap
     * @returns {number} a positive integer within the allowed range
     */
    private static clampHistoryLimit(limit?: number): number {
        if (!limit || Number.isNaN(limit) || limit < 1) {
            return DashboardService.DEFAULT_HEALTH_HISTORY_LIMIT;
        }

        return Math.min(Math.floor(limit), DashboardService.MAX_HEALTH_HISTORY_LIMIT);
    }
}
