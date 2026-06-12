export type ContactRole =
    | 'APP_OWNER'
    | 'ON_CALL_PRIMARY'
    | 'ON_CALL_SECONDARY'
    | 'TECH_LEAD'
    | 'DBA'
    | 'VENDOR'
    | 'ESCALATION_MANAGER';

export interface Team {
    id?: string;
    name: string;
    department: string;
    slackChannel?: string;
    emailDistributionList?: string;
}

export default interface Contact {
    id?: string;
    teamId: string;
    employeeId: string;
    displayName: string;
    email: string;
    phone: string;
    role: ContactRole;
    isPrimaryContact: boolean;
}
