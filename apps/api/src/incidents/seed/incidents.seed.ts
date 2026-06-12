import { Incident } from '@operational-dashboard/shared-api-model/model/dashboard';

const SEED_INCIDENTS: Omit<Incident, 'id'>[] = [
    {
        incidentNumber: 'INC-20260528-001',
        applicationId: '', // will be set during seeding
        severity: 'SEV_1',
        title: 'Database connection pool exhaustion',
        description:
            'SAP ERP database connection pool has been fully exhausted causing all transactions to fail. Users unable to process any financial operations.',
        status: 'INVESTIGATING',
        businessImpactLevel: 'CRITICAL',
        estimatedUsersImpacted: 1204,
        reportedBy: 'monitoring-system',
        assignedTo: 'John Smith',
        openedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min ago
        impactSummary:
            'All SAP ERP transactions failing. Finance team unable to process end-of-month close.',
    },
];

export default SEED_INCIDENTS;
