import { ApplicationMonitor } from '@operational-dashboard/shared-api-model/model/dashboard';

import { PortfolioApp } from '../portfolio.model';

/**
 * Seed a handful of representative ApplicationMonitor entries for demo mode (US-1.4).
 * Provides realistic OK / Warn / Alert / No-Data counts so the estate-wide tile is
 * meaningful in screenshots. `datadogState` carries the raw 4-state value.
 */
export const SEED_MONITORS_GREEN: ApplicationMonitor[] = [
    {
        id: 101,
        name: 'Availability check',
        status: 'GREEN',
        datadogState: 'OK',
        message: '',
        lastTriggeredAt: null,
        inMaintenance: false,
    },
    {
        id: 102,
        name: 'Latency P95',
        status: 'GREEN',
        datadogState: 'OK',
        message: '',
        lastTriggeredAt: null,
        inMaintenance: false,
    },
];

export const SEED_MONITORS_WARN: ApplicationMonitor[] = [
    {
        id: 201,
        name: 'Error rate',
        status: 'AMBER',
        datadogState: 'Warn',
        message: 'Error rate approaching threshold',
        lastTriggeredAt: '2026-06-28T10:00:00Z',
        inMaintenance: false,
    },
    {
        id: 202,
        name: 'Memory usage',
        status: 'AMBER',
        datadogState: 'Warn',
        message: 'Memory at 85%',
        lastTriggeredAt: '2026-06-29T08:30:00Z',
        inMaintenance: false,
    },
];

export const SEED_MONITORS_ALERT: ApplicationMonitor[] = [
    {
        id: 301,
        name: 'Availability check',
        status: 'RED',
        datadogState: 'Alert',
        message: 'Endpoint returning 503',
        lastTriggeredAt: '2026-06-30T06:15:00Z',
        inMaintenance: false,
    },
];

export const SEED_MONITORS_NO_DATA: ApplicationMonitor[] = [
    {
        id: 401,
        name: 'Synthetic login probe',
        status: 'AMBER',
        datadogState: 'No Data',
        message: '',
        lastTriggeredAt: null,
        inMaintenance: false,
    },
];

const createApp = (
    id: string,
    name: string,
    health: PortfolioApp['health'],
    perception: PortfolioApp['perception'],
    uptime: number | null,
    users: number,
    incidents: number,
    lastIncident: string,
    monitors: ApplicationMonitor[] = []
): PortfolioApp => ({
    id,
    name,
    health,
    perception,
    uptime,
    users,
    totalInternalUsers: users,
    totalExternalUsers: 0,
    activeUsers: users,
    incidents,
    lastIncident,
    monitors,
});

export default createApp;
