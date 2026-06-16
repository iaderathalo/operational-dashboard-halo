import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { Repository } from '../repository/repository';

export interface ApplicationRepository extends Repository<Application> {
    findByFilters(filters: {
        id?: string;
        status?: string;
        tier?: number;
        businessUnit?: string;
        search?: string;
        ownerEmail?: string;
    }): Promise<Application[]>;
    updateHealth(id: object, health: Partial<Application>): Promise<number>;
}
