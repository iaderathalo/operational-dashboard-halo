import { PortfolioNode } from '../portfolio.model';
import CAREER_PORTFOLIO_NODE from './portfolio.seed.career';
import ENTERPRISE_PORTFOLIO_NODE from './portfolio.seed.enterprise';
import HEALTH_PORTFOLIO_NODE from './portfolio.seed.health';
import WEALTH_PORTFOLIO_NODE from './portfolio.seed.wealth';

const SEED_PORTFOLIO: PortfolioNode = {
    id: 'root',
    name: 'All Portfolios',
    role: 'COO',
    owner: 'Rami Assaad',
    children: [
        HEALTH_PORTFOLIO_NODE,
        WEALTH_PORTFOLIO_NODE,
        CAREER_PORTFOLIO_NODE,
        ENTERPRISE_PORTFOLIO_NODE,
    ],
    apps: [],
};

export default SEED_PORTFOLIO;
