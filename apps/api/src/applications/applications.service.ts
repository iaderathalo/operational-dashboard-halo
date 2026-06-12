import { Logger } from '@mmctech-artifactory/polaris-logger';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { ApplicationRepository } from './application.repository';

@Injectable()
export default class ApplicationsService {
    constructor(
        @Inject('ApplicationRepository')
        private readonly applicationRepository: ApplicationRepository,
        private logger: Logger
    ) {}

    async findAll(filters?: {
        status?: string;
        tier?: number;
        businessUnit?: string;
        search?: string;
    }): Promise<Application[]> {
        this.logger.info('Finding all applications');
        if (filters && Object.keys(filters).some((k) => filters[k])) {
            return this.applicationRepository.findByFilters(filters);
        }
        return this.applicationRepository.findAll();
    }

    async findOne(id: string): Promise<Application> {
        this.logger.info(`Finding application with id: ${id}`);
        const app = await this.applicationRepository.findOne({ _id: id });
        if (!app) {
            throw new NotFoundException(`Application with id ${id} not found`);
        }
        return app;
    }

    async create(application: Application): Promise<string | object> {
        this.logger.info(`Creating application: ${application.name}`);
        if (!application.name) {
            throw new BadRequestException('Application name is required');
        }
        return this.applicationRepository.create(application);
    }

    async update(id: string, application: Application): Promise<number> {
        this.logger.info(`Updating application with id: ${id}`);
        const updated = await this.applicationRepository.updateOne({ _id: id }, application);
        if (!updated) {
            throw new NotFoundException(`Application with id ${id} not found`);
        }
        return updated;
    }

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

    async clearStatusOverride(id: string): Promise<Application> {
        this.logger.info(`Clearing status override for application ${id}`);
        const app = await this.findOne(id);
        delete app.statusOverride;
        await this.applicationRepository.updateOne({ _id: id }, app);
        return app;
    }

    async delete(id: string): Promise<boolean> {
        this.logger.info(`Deleting application with id: ${id}`);
        return this.applicationRepository.deleteOne({ _id: id });
    }
}
