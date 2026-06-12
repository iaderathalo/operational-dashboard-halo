import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Contact, Team } from '@operational-dashboard/shared-api-model/model/dashboard';

import { TeamRepository } from './team.repository';

@Injectable()
export default class TeamsService {
    constructor(
        @Inject('TeamRepository') private readonly teamRepository: TeamRepository,
        private logger: Logger
    ) {}

    async findAll(): Promise<Team[]> {
        this.logger.info('Finding all teams');
        return this.teamRepository.findAll();
    }

    async findOne(id: string): Promise<Team> {
        const team = await this.teamRepository.findOne({ _id: id });
        if (!team) {
            throw new NotFoundException(`Team with id ${id} not found`);
        }
        return team;
    }

    async findOnCallContacts(teamId: string): Promise<Contact[]> {
        this.logger.info(`Finding on-call contacts for team ${teamId}`);
        const contacts = await this.teamRepository.findContacts(teamId);
        return contacts.filter(
            (c) => c.role === 'ON_CALL_PRIMARY' || c.role === 'ON_CALL_SECONDARY'
        );
    }

    async findContactsByTeamId(teamId: string): Promise<Contact[]> {
        this.logger.info(`Finding all contacts for team ${teamId}`);
        return this.teamRepository.findContacts(teamId);
    }
}
