import { ApplicationMonitor } from '@operational-dashboard/shared-api-model/model/dashboard';

export interface PortfolioNode {
    id: string;
    name: string;
    role: string;
    owner: string;
    children: PortfolioNode[];
    apps: PortfolioApp[];
}

export interface PortfolioAppAmsSupport {
    maintenance?: string | null;
    applicationEngineering?: string | null;
    applicationSupport?: string | null;
    databaseServices?: string | null;
    itControls?: string | null;
}

export interface PortfolioApp {
    id: string;
    name: string;
    health: 'green' | 'amber' | 'red' | 'undefined';
    perception: 'green' | 'amber' | 'red' | 'undefined';
    uptime: number | null;
    errorBudgetRemainingPct?: number | null;
    slaTarget?: number | null;
    datadogMapped?: boolean;
    resolutionPath?: 'primary' | 'fallback' | 'unmapped' | null;
    lastSyncStatus?: 'ok' | 'error' | 'unmapped' | null;
    lastSyncAt?: string | null;
    monitors?: ApplicationMonitor[];
    users: number;
    totalInternalUsers: number;
    totalExternalUsers: number;
    activeUsers: number | null;
    incidents: number;
    lastIncident: string;
    amsSupport?: PortfolioAppAmsSupport;
    portfolioOwnerName?: string | null;
    portfolioOwnerEmail?: string | null;
    technicalContact?: string | null;
    technicalContactEmail?: string | null;
    podName?: string | null;
    podLead?: string | null;
    podLeadEmail?: string | null;
    itOwner?: string | null;
    itOwnerEmail?: string | null;
    businessOwner?: string | null;
    businessOwnerEmail?: string | null;
}

export interface PortfolioAppContext {
    app: PortfolioApp;
    path: PortfolioNode[];
}
