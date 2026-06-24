import {
    DashboardDetailResponse,
    DigestSummary,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioNode } from './portfolio.model';

export interface PortfolioRepository {
    getPortfolio(userEmail?: string): Promise<PortfolioNode>;

    getAppContext(appId: string, userEmail?: string): Promise<PortfolioAppContext | null>;

    getAppDetail(appId: string, userEmail?: string): Promise<DashboardDetailResponse | null>;

    getDigest(userEmail?: string): Promise<DigestSummary>;
}
