export interface PortfolioNode {
    id: string;
    name: string;
    role: string;
    owner: string;
    children: PortfolioNode[];
    apps: PortfolioApp[];
}

export interface PortfolioApp {
    id: string;
    name: string;
    health: 'green' | 'amber' | 'red';
    perception: 'green' | 'amber' | 'red';
    uptime: number;
    users: number;
    incidents: number;
    lastIncident: string;
}

export interface PortfolioAppContext {
    app: PortfolioApp;
    path: PortfolioNode[];
}

export interface StatusCounts {
    green: number;
    amber: number;
    red: number;
}
