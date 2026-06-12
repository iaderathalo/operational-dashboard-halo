import { DashboardDetailResponse } from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioAppContext, PortfolioNode } from './portfolio.model';

export interface PortfolioRepository {
    getPortfolio(): Promise<PortfolioNode>;

    getAppContext(appId: string): Promise<PortfolioAppContext | null>;

    getAppDetail(appId: string): Promise<DashboardDetailResponse | null>;
}
