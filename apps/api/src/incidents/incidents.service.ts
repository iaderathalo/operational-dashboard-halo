import { Logger } from '@mmctech-artifactory/polaris-logger';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    CreateIncidentRequest,
    Incident,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { IncidentRepository } from './incident.repository';

@Injectable()
export default class IncidentsService {
    constructor(
        @Inject('IncidentRepository') private readonly incidentRepository: IncidentRepository,
        private logger: Logger
    ) {}

    async findAll(filters?: {
        status?: string;
        severity?: string;
        applicationId?: string;
    }): Promise<Incident[]> {
        this.logger.info('Finding all incidents');
        if (filters && Object.keys(filters).some((k) => filters[k])) {
            return this.incidentRepository.findByFilters(filters);
        }
        return this.incidentRepository.findAll();
    }

    async findOne(id: string): Promise<Incident> {
        this.logger.info(`Finding incident with id: ${id}`);
        const incident = await this.incidentRepository.findOne({ _id: id });
        if (!incident) {
            throw new NotFoundException(`Incident with id ${id} not found`);
        }
        return incident;
    }

    async create(request: CreateIncidentRequest): Promise<Incident> {
        this.logger.info(`Creating incident for application: ${request.applicationId}`);
        if (!request.title || !request.applicationId) {
            throw new BadRequestException('Title and applicationId are required');
        }

        const incidentNumber = `INC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-3)}`;

        const incident: Incident = {
            ...request,
            incidentNumber,
            status: 'OPEN',
            openedAt: new Date().toISOString(),
        };

        const insertedId = await this.incidentRepository.create(incident);
        return { ...incident, id: String(insertedId) };
    }

    async update(id: string, updates: Partial<Incident>): Promise<Incident> {
        this.logger.info(`Updating incident with id: ${id}`);
        const existing = await this.findOne(id);
        const updated = { ...existing, ...updates };
        delete updated.id;
        await this.incidentRepository.updateOne({ _id: id }, updated as Incident);
        return { ...updated, id };
    }

    async findActiveByApplicationId(applicationId: string): Promise<Incident[]> {
        return this.incidentRepository.findActiveByApplicationId(applicationId);
    }
}
