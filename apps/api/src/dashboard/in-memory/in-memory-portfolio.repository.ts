import { Injectable } from '@nestjs/common';

import { DashboardDetailResponse } from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioNode } from '../portfolio.model';
import { PortfolioRepository } from '../portfolio.repository';
import createDashboardDetailResponse from '../seed/detail.seed';
import SEED_PORTFOLIO from '../seed/portfolio.seed';

const findAppContext = (
    appId: string,
    node: PortfolioNode,
    path: PortfolioNode[] = []
): PortfolioAppContext | null => {
    const matchingApp = (node.apps || []).find((app) => app.id === appId);

    if (matchingApp) {
        return {
            app: matchingApp,
            path: [...path, node],
        };
    }

    return (
        (node.children || [])
            .map((child) => findAppContext(appId, child, [...path, node]))
            .find((context): context is PortfolioAppContext => context !== null) || null
    );
};

@Injectable()
export default class InMemoryPortfolioRepository implements PortfolioRepository {
    private readonly portfolio = JSON.parse(JSON.stringify(SEED_PORTFOLIO)) as PortfolioNode;

    /**
     * Returns the seeded portfolio tree from memory.
     * @returns {Promise<object>} dashboard portfolio tree
     */
    async getPortfolio(): Promise<PortfolioNode> {
        return JSON.parse(JSON.stringify(this.portfolio)) as PortfolioNode;
    }

    /**
     * Returns the detail context for a single application from the seeded portfolio.
     * @param {string} appId - portfolio application id
     * @returns {Promise<object | null>} application context when found
     */
    async getAppContext(appId: string): Promise<PortfolioAppContext | null> {
        const context = findAppContext(appId, this.portfolio);

        return context ? (JSON.parse(JSON.stringify(context)) as PortfolioAppContext) : null;
    }

    /**
     * Returns the seeded detail payload for a single application.
     * @param {string} appId - portfolio application id
     * @returns {Promise<object | null>} application detail payload when found
     */
    async getAppDetail(appId: string): Promise<DashboardDetailResponse | null> {
        const context = await this.getAppContext(appId);

        return context ? createDashboardDetailResponse(context) : null;
    }
}
