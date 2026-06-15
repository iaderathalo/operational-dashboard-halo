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
    health: 'green' | 'amber' | 'red' | 'undefined';
    perception: 'green' | 'amber' | 'red' | 'undefined';
    uptime: number | null;
    users: number;
    totalInternalUsers: number;
    totalExternalUsers: number;
    activeUsers: number | null;
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
    undefined: number;
}
