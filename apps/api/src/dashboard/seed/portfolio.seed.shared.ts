import { PortfolioApp } from '../portfolio.model';

const createApp = (
    id: string,
    name: string,
    health: PortfolioApp['health'],
    perception: PortfolioApp['perception'],
    uptime: number,
    users: number,
    incidents: number,
    lastIncident: string
): PortfolioApp => ({
    id,
    name,
    health,
    perception,
    uptime,
    users,
    incidents,
    lastIncident,
});

export default createApp;
