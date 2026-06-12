import {
    Application,
    ApplicationStatus,
    DashboardSummary,
    Incident,
    Contact,
    Team,
    UptimeMetrics,
} from '@operational-dashboard/shared-api-model/model/dashboard';

export { Application, ApplicationStatus, DashboardSummary, Incident, Contact, Team, UptimeMetrics };

export interface DashboardFilters {
    status: ApplicationStatus | '';
    businessUnit: string;
    tier: number | null;
    search: string;
    sortBy: 'status' | 'name' | 'users';
}
