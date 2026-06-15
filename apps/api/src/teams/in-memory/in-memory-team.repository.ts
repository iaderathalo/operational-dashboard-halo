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

    /**
     * Finds a single team by identifier.
     * @param {{ _id: string }} teamId - wrapped team identifier
     * @returns {Promise<object>} matching team, if found
     */
    async findOne(teamId): Promise<Team> {
        const { _id: id } = teamId;
        return this.teams.find((t) => t.id === id) || null;
    }

    /**
     * Returns all teams.
     * @returns {Promise<object[]>} all stored teams
     */
    async findAll(): Promise<Team[]> {
        return [...this.teams];
    }

    /**
     * Returns contacts for a team.
     * @param {string} teamId - team identifier
     * @returns {Promise<object[]>} contacts assigned to the team
     */
    async findContacts(teamId: string): Promise<Contact[]> {
        return this.contacts.filter((c) => c.teamId === teamId);
    }

    /**
     * Returns contacts for an application team.
     * @param {string} teamId - application team identifier
     * @returns {Promise<object[]>} contacts assigned to the team
     */
    async findContactsByApplicationTeam(teamId: string): Promise<Contact[]> {
        return this.findContacts(teamId);
    }

    /**
     * Replaces a stored team.
     * @param {{ _id: string }} teamId - wrapped team identifier
     * @param {object} entity - replacement team payload
     * @returns {Promise<number>} 1 when the team was updated, otherwise 0
     */
    async updateOne(teamId, entity: Team): Promise<number> {
        const { _id: id } = teamId;
        const index = this.teams.findIndex((t) => t.id === id);
        if (index === -1) return 0;
        this.teams[index] = { ...entity, id };
        return 1;
    }

    /**
     * Deletes a stored team.
     * @param {{ _id: string }} teamId - wrapped team identifier
     * @returns {Promise<boolean>} true when the team was removed
     */
    async deleteOne(teamId): Promise<boolean> {
        const { _id: id } = teamId;
        const index = this.teams.findIndex((t) => t.id === id);
        if (index === -1) return false;
        this.teams.splice(index, 1);
        return true;
    }

    /**
     * Creates a team.
     * @param {object} team - team payload to create
     * @returns {Promise<string>} generated team identifier
     */
    async create(team: Team): Promise<string> {
        const id = uuidv4();
        this.teams.push({ ...team, id });
        return id;
    }

    /**
     * Deletes all teams.
     * @returns {Promise<number>} number of removed teams
     */
    async deleteAll(): Promise<number> {
        const count = this.teams.length;
        this.teams = [];
        return count;
    }
}
