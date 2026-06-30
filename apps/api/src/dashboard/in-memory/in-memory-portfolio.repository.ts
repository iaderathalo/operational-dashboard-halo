import { Injectable } from '@nestjs/common';

import {
    DashboardDetailResponse,
    DigestSummary,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioNode, PortfolioSearchResult } from '../portfolio.model';
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

    /**
     * Searches seeded applications by name (seed data has no shortCode).
     * Derives the health and hierarchy breadcrumb from the app and its tree path.
     * @param {string} q - search query (minimum 3 characters for a result)
     * @returns {Promise<PortfolioSearchResult[]>} rich matching results
     */
    async searchApps(q: string): Promise<PortfolioSearchResult[]> {
        if (q.trim().length < 3) {
            return [];
        }
        const term = q.trim().toLowerCase();
        const results: PortfolioSearchResult[] = [];

        const collectApps = (node: PortfolioNode): void => {
            (node.apps || []).forEach((app) => {
                if (app.name.toLowerCase().includes(term)) {
                    const context = findAppContext(app.id, this.portfolio);
                    const path = context?.path || [];
                    results.push({
                        id: app.id,
                        name: app.name,
                        shortCode: '',
                        health: app.health,
                        opCo: path[1]?.name || '',
                        businessUnit: path[2]?.name || '',
                        lob: path[3]?.name || '',
                    });
                }
            });
            (node.children || []).forEach(collectApps);
        };

        collectApps(this.portfolio);
        return results.slice(0, 20);
    }

    /**
     * 11-4: returns a digest derived from the seeded tree's apps. The in-memory repo
     * has no sync state, so freshness is ok and there is no prior period.
     * @returns {Promise<object>} the derived digest summary
     */
    async getDigest(): Promise<DigestSummary> {
        const flatten = (node: PortfolioNode): { healthy: number; mapped: number }[] =>
            (node.apps || [])
                .map((app) => ({
                    healthy: app.health === 'green' ? 1 : 0,
                    mapped: app.datadogMapped ? 1 : 0,
                }))
                .concat(...(node.children || []).map(flatten));

        const apps = flatten(this.portfolio);
        const total = apps.length;
        const pct = (sum: number): number | null =>
            total ? Math.round((sum / total) * 1000) / 10 : null;

        return {
            generatedAt: new Date().toISOString(),
            scope: 'all',
            rollup: {
                appCount: total,
                healthyPct: pct(apps.reduce((sum, app) => sum + app.healthy, 0)),
                coveragePct: pct(apps.reduce((sum, app) => sum + app.mapped, 0)),
                sloPassingPct: null,
                avgMaturity: null,
                fastBurnCount: 0,
            },
            freshness: { ok: true, failedCount: 0, lastSyncAt: null, note: null },
            priorPeriod: null,
            movers: [],
            newRisks: [],
            note: 'No prior period to compare against yet — point-in-time snapshot.',
        };
    }
}
