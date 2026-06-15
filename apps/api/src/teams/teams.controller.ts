import { Controller, Get, Param } from '@nestjs/common';

import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import TeamsService from './teams.service';

@Controller('teams')
export default class TeamsController {
    /**
     * Creates the teams controller.
     * @param {object} teamsService - service that provides team and contact data
     */
    constructor(private readonly teamsService: TeamsService) {}

    /**
     * Returns all teams.
     * @returns {Promise<object[]>} all available teams
     */
    @Get()
    async findAll(): Promise<Team[]> {
        return this.teamsService.findAll();
    }

    /**
     * Returns on-call contacts for a team.
     * @param {string} id - team identifier
     * @returns {Promise<object[]>} on-call contacts for the team
     */
    @Get(':id/on-call')
    async findOnCall(@Param('id') id: string): Promise<Contact[]> {
        return this.teamsService.findOnCallContacts(id);
    }

    /**
     * Returns all contacts for a team.
     * @param {string} id - team identifier
     * @returns {Promise<object[]>} contacts assigned to the team
     */
    @Get(':id/contacts')
    async findContacts(@Param('id') id: string): Promise<Contact[]> {
        return this.teamsService.findContactsByTeamId(id);
    }
}
