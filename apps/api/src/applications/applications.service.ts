import { Logger } from '@mmctech-artifactory/polaris-logger';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { ApplicationRepository } from './application.repository';

@Injectable()
export default class ApplicationsService {
    /**
     * Creates the applications service.
     * @param {object} applicationRepository - repository used to query and persist applications
     * @param {object} logger - logger used for service diagnostics
     */
    constructor(
        @Inject('ApplicationRepository')
        private readonly applicationRepository: ApplicationRepository,
        private logger: Logger
    ) {}

    /**
     * Returns applications that match the optional filters and owner scope.
     * @param {object} [filters] - optional application filter set
     * @param {string} [filters.status] - optional application status filter
     * @param {number} [filters.tier] - optional application tier filter
     * @param {string} [filters.businessUnit] - optional business-unit filter
     * @param {string} [filters.search] - optional text search filter
     * @param {string} [ownerEmail] - optional owner email used to scope results
     * @returns {Promise<object[]>} matching applications
     */
    async findAll(
        filters?: {
            status?: string;
            tier?: number;
            businessUnit?: string;
            search?: string;
        },
        ownerEmail?: string
    ): Promise<Application[]> {
        this.logger.info('Finding all applications');
        if ((filters && Object.keys(filters).some((k) => filters[k])) || ownerEmail) {
            return this.applicationRepository.findByFilters({
                ...filters,
                ownerEmail,
            });
        }
        return this.applicationRepository.findAll();
    }

    /**
     * Returns a single application by identifier.
     * @param {string} id - application identifier
     * @param {string} [ownerEmail] - optional owner email used to scope access
     * @returns {Promise<object>} matching application
     */
    async findOne(id: string, ownerEmail?: string): Promise<Application> {
        this.logger.info(`Finding application with id: ${id}`);
        const app = ownerEmail
            ? (await this.applicationRepository.findByFilters({ id, ownerEmail }))[0]
            : await this.applicationRepository.findOne({ _id: id });
        if (!app) {
            throw new NotFoundException(`Application with id ${id} not found`);
        }
        return app;
    }

    /**
     * Creates a new application record.
     * @param {object} application - application payload to create
     * @returns {Promise<string|object>} inserted identifier from the repository
     */
    async create(application: Application): Promise<string | object> {
        this.logger.info(`Creating application: ${application.name}`);
        if (!application.name) {
            throw new BadRequestException('Application name is required');
        }
        return this.applicationRepository.create(application);
    }

    /**
     * Updates an existing application record.
     * @param {string} id - application identifier
     * @param {object} application - replacement application payload
     * @returns {Promise<number>} number of updated records
     */
    async update(id: string, application: Application): Promise<number> {
        this.logger.info(`Updating application with id: ${id}`);
        const updated = await this.applicationRepository.updateOne({ _id: id }, application);
        if (!updated) {
            throw new NotFoundException(`Application with id ${id} not found`);
        }
        return updated;
    }

    /**
     * Applies a manual status override to an application.
     * @param {string} id - application identifier
     * @param {object} override - status override payload
     * @param {string} override.status - overridden status value
     * @param {string} override.overriddenBy - actor applying the override
     * @param {string} override.reason - rationale for the override
     * @returns {Promise<object>} updated application
     */
    async updateStatusOverride(
        id: string,
        override: { status: string; overriddenBy: string; reason: string }
    ): Promise<Application> {
        this.logger.info(`Setting status override for application ${id}`);
        const app = await this.findOne(id);
        app.statusOverride = {
            status: override.status as Application['currentStatus'],
            overriddenBy: override.overriddenBy,
            reason: override.reason,
            overriddenAt: new Date().toISOString(),
        };
        app.currentStatus = override.status as Application['currentStatus'];
        await this.applicationRepository.updateOne({ _id: id }, app);
        return app;
    }

    /**
     * Clears the manual status override for an application.
     * @param {string} id - application identifier
     * @returns {Promise<object>} updated application without a status override
     */
    async clearStatusOverride(id: string): Promise<Application> {
        this.logger.info(`Clearing status override for application ${id}`);
        const app = await this.findOne(id);
        delete app.statusOverride;
        await this.applicationRepository.updateOne({ _id: id }, app);
        return app;
    }

    /**
     * Deletes an application by identifier.
     * @param {string} id - application identifier
     * @returns {Promise<boolean>} true when the application was deleted
     */
    async delete(id: string): Promise<boolean> {
        this.logger.info(`Deleting application with id: ${id}`);
        return this.applicationRepository.deleteOne({ _id: id });
    }
}
