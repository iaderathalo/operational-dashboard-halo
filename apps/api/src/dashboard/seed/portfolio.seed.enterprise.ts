import { PortfolioNode } from '../portfolio.model';
import createApp from './portfolio.seed.shared';

const ENTERPRISE_PORTFOLIO_NODE: PortfolioNode = {
    id: 'bu5',
    name: 'Enterprise and Corporate',
    role: 'VP',
    owner: 'Maria Garcia',
    children: [],
    apps: [
        createApp('bu5-service-now', 'Service Now', 'red', 'red', 96.8, 28000, 3, '45 min ago'),
        createApp('bu5-workday', 'Workday', 'amber', 'amber', 99.2, 3200, 0, '1 day ago'),
        createApp('bu5-sharepoint', 'Sharepoint', 'green', 'green', 99.87, 890, 0, '18 days ago'),
        createApp('bu5-ms-teams', 'MS Teams', 'green', 'green', 99.93, 15000, 0, '22 days ago'),
    ],
};

export default ENTERPRISE_PORTFOLIO_NODE;
