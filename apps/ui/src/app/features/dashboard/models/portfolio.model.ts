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
    datadogMapped?: boolean;
    resolutionPath?: 'primary' | 'fallback' | 'unmapped' | null;
    lastSyncStatus?: 'ok' | 'error' | 'unmapped' | null;
    lastSyncAt?: string | null;
    users: number;
    totalInternalUsers: number;
    totalExternalUsers: number;
    activeUsers: number | null;
    incidents: number;
    lastIncident: string;
    maturity?: AppMaturity;
}

export interface AppMaturity {
    score: number;
    max: number;
    signals: {
        mapped: boolean;
        hasMonitor: boolean;
        hasSLO: boolean;
        sloPassing: boolean;
        hasOwner: boolean;
    };
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
