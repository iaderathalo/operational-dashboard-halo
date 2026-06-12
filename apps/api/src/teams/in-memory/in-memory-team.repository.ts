import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import { SEED_CONTACTS, SEED_TEAMS } from '../seed/teams.seed';
import { TeamRepository } from '../team.repository';

@Injectable()
export default class InMemoryTeamRepository implements TeamRepository {
    private teams: Team[] = SEED_TEAMS.map((team) => ({
        ...team,
        id: uuidv4(),
    }));

    private contacts: Contact[] = SEED_CONTACTS.map((contact) => ({
        ...contact,
        id: uuidv4(),
    }));

    async findOne(teamId): Promise<Team> {
        const { _id: id } = teamId;
        return this.teams.find((t) => t.id === id) || null;
    }

    async findAll(): Promise<Team[]> {
        return [...this.teams];
    }

    async findContacts(teamId: string): Promise<Contact[]> {
        return this.contacts.filter((c) => c.teamId === teamId);
    }

    async findContactsByApplicationTeam(teamId: string): Promise<Contact[]> {
        return this.findContacts(teamId);
    }

    async updateOne(teamId, entity: Team): Promise<number> {
        const { _id: id } = teamId;
        const index = this.teams.findIndex((t) => t.id === id);
        if (index === -1) return 0;
        this.teams[index] = { ...entity, id };
        return 1;
    }

    async deleteOne(teamId): Promise<boolean> {
        const { _id: id } = teamId;
        const index = this.teams.findIndex((t) => t.id === id);
        if (index === -1) return false;
        this.teams.splice(index, 1);
        return true;
    }

    async create(team: Team): Promise<string> {
        const id = uuidv4();
        this.teams.push({ ...team, id });
        return id;
    }

    async deleteAll(): Promise<number> {
        const count = this.teams.length;
        this.teams = [];
        return count;
    }
}
