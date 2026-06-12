import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import { Repository } from '../repository/repository';

export interface TeamRepository extends Repository<Team> {
    findContacts(teamId: string): Promise<Contact[]>;
    findContactsByApplicationTeam(teamId: string): Promise<Contact[]>;
}
