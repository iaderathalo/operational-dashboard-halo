import { Logger } from '@mmctech-artifactory/polaris-logger';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    CreateIncidentRequest,
    Incident,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { IncidentRepository } from './incident.repository';

@Injectable()
export default class IncidentsService {
    /**
     * Creates the incidents service.
     * @param {object} incidentRepository - repository used to query and persist incidents
     * @param {object} logger - logger used for service diagnostics
     */
    constructor(
        @Inject('IncidentRepository') private readonly incidentRepository: IncidentRepository,
        private logger: Logger
    ) {}

    /**
     * Returns incidents that match the optional filter set.
     * @param {object} [filters] - optional incident filter set
     * @param {string} [filters.status] - optional incident status filter
     * @param {string} [filters.severity] - optional incident severity filter
     * @param {string} [filters.applicationId] - optional application identifier filter
     * @returns {Promise<object[]>} matching incidents
     */
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

    /**
     * Returns a single incident by identifier.
     * @param {string} id - incident identifier
     * @returns {Promise<object>} matching incident
     */
    async findOne(id: string): Promise<Incident> {
        this.logger.info(`Finding incident with id: ${id}`);
        const incident = await this.incidentRepository.findOne({ _id: id });
        if (!incident) {
            throw new NotFoundException(`Incident with id ${id} not found`);
        }
        return incident;
    }

    /**
     * Creates a new incident from the supplied request payload.
     * @param {object} request - incident creation payload
     * @returns {Promise<object>} created incident
     */
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

    /**
     * Updates an existing incident.
     * @param {string} id - incident identifier
     * @param {object} updates - partial incident changes to apply
     * @returns {Promise<object>} updated incident
     */
    async update(id: string, updates: Partial<Incident>): Promise<Incident> {
        this.logger.info(`Updating incident with id: ${id}`);
        const existing = await this.findOne(id);
        const updated = { ...existing, ...updates };
        delete updated.id;
        await this.incidentRepository.updateOne({ _id: id }, updated as Incident);
        return { ...updated, id };
    }

    /**
     * Returns active incidents for a specific application.
     * @param {string} applicationId - application identifier
     * @returns {Promise<object[]>} active incidents for the application
     */
    async findActiveByApplicationId(applicationId: string): Promise<Incident[]> {
        return this.incidentRepository.findActiveByApplicationId(applicationId);
    }
}
