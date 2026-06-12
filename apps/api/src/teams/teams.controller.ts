import { Controller, Get, Param } from '@nestjs/common';

import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import TeamsService from './teams.service';

@Controller('teams')
export default class TeamsController {
    constructor(private readonly teamsService: TeamsService) {}

    @Get()
    async findAll(): Promise<Team[]> {
        return this.teamsService.findAll();
    }

    @Get(':id/on-call')
    async findOnCall(@Param('id') id: string): Promise<Contact[]> {
        return this.teamsService.findOnCallContacts(id);
    }

    @Get(':id/contacts')
    async findContacts(@Param('id') id: string): Promise<Contact[]> {
        return this.teamsService.findContactsByTeamId(id);
    }
}
