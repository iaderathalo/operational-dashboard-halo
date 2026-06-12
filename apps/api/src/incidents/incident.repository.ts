import { Incident } from '@operational-dashboard/shared-api-model/model/dashboard';

import { Repository } from '../repository/repository';

export interface IncidentRepository extends Repository<Incident> {
    findByFilters(filters: {
        status?: string;
        severity?: string;
        applicationId?: string;
    }): Promise<Incident[]>;
    findActiveByApplicationId(applicationId: string): Promise<Incident[]>;
}
