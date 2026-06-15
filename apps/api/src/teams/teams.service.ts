import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import { TeamRepository } from './team.repository';

@Injectable()
export default class TeamsService {
    /**
     * Creates the teams service.
     * @param {object} teamRepository - repository used to load and persist team records
     * @param {object} logger - logger used for teams service diagnostics
     */
    constructor(
        @Inject('TeamRepository') private readonly teamRepository: TeamRepository,
        private logger: Logger
    ) {}

    /**
     * Returns all teams.
     * @returns {Promise<object[]>} all available teams
     */
    async findAll(): Promise<Team[]> {
        this.logger.info('Finding all teams');
        return this.teamRepository.findAll();
    }

    /**
     * Returns a single team by identifier.
     * @param {string} id - team identifier
     * @returns {Promise<object>} matching team
     */
    async findOne(id: string): Promise<Team> {
        const team = await this.teamRepository.findOne({ _id: id });
        if (!team) {
            throw new NotFoundException(`Team with id ${id} not found`);
        }
        return team;
    }

    /**
     * Returns on-call contacts for a team.
     * @param {string} teamId - team identifier
     * @returns {Promise<object[]>} on-call contacts for the team
     */
    async findOnCallContacts(teamId: string): Promise<Contact[]> {
        this.logger.info(`Finding on-call contacts for team ${teamId}`);
        const contacts = await this.teamRepository.findContacts(teamId);
        return contacts.filter(
            (c) => c.role === 'ON_CALL_PRIMARY' || c.role === 'ON_CALL_SECONDARY'
        );
    }

    /**
     * Returns all contacts for a team.
     * @param {string} teamId - team identifier
     * @returns {Promise<object[]>} contacts associated with the team
     */
    async findContactsByTeamId(teamId: string): Promise<Contact[]> {
        this.logger.info(`Finding all contacts for team ${teamId}`);
        return this.teamRepository.findContacts(teamId);
    }
}
