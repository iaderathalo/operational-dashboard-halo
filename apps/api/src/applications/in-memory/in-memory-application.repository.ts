import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import { ApplicationRepository } from '../application.repository';
import SEED_APPLICATIONS from '../seed/applications.seed';

@Injectable()
export default class InMemoryApplicationRepository implements ApplicationRepository {
    private applications: Application[] = SEED_APPLICATIONS.map((app) => ({
        ...app,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    /**
     *
     * @param appId
     */
    async findOne(appId): Promise<Application> {
        const { _id: id } = appId;
        return this.applications.find((a) => a.id === id) || null;
    }

    /**
     *
     */
    async findAll(): Promise<Application[]> {
        return [...this.applications];
    }

    /**
     *
     * @param filters
     * @param filters.id
     * @param filters.status
     * @param filters.tier
     * @param filters.businessUnit
     * @param filters.search
     * @param filters.ownerEmail
     */
    async findByFilters(filters: {
        id?: string;
        status?: string;
        tier?: number;
        businessUnit?: string;
        search?: string;
        ownerEmail?: string;
    }): Promise<Application[]> {
        let result = [...this.applications];

        if (filters.id) {
            result = result.filter((a) => a.id === filters.id);
        }

        if (filters.status) {
            result = result.filter((a) => a.currentStatus === filters.status);
        }
        if (filters.tier) {
            result = result.filter((a) => a.tier === filters.tier);
        }
        if (filters.businessUnit) {
            result = result.filter((a) => a.businessUnit === filters.businessUnit);
        }
        if (filters.search) {
            const search = filters.search.toLowerCase();
            result = result.filter(
                (a) =>
                    a.name.toLowerCase().includes(search) ||
                    a.shortCode.toLowerCase().includes(search) ||
                    a.description.toLowerCase().includes(search)
            );
        }

        return result;
    }

    /**
     *
     * @param appId
     * @param entity
     */
    async updateOne(appId, entity: Application): Promise<number> {
        const { _id: id } = appId;
        const index = this.applications.findIndex((a) => a.id === id);
        if (index === -1) return 0;
        this.applications[index] = { ...entity, id, updatedAt: new Date().toISOString() };
        return 1;
    }

    /**
     *
     * @param appId
     * @param health
     */
    async updateHealth(appId, health: Partial<Application>): Promise<number> {
        const { _id: id } = appId;
        const index = this.applications.findIndex((a) => a.id === id);
        if (index === -1) return 0;
        this.applications[index] = {
            ...this.applications[index],
            ...health,
            updatedAt: new Date().toISOString(),
        };
        return 1;
    }

    /**
     *
     * @param appId
     */
    async deleteOne(appId): Promise<boolean> {
        const { _id: id } = appId;
        const index = this.applications.findIndex((a) => a.id === id);
        if (index === -1) return false;
        this.applications.splice(index, 1);
        return true;
    }

    /**
     *
     * @param app
     */
    async create(app: Application): Promise<string> {
        const id = uuidv4();
        this.applications.push({
            ...app,
            id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return id;
    }

    /**
     *
     */
    async deleteAll(): Promise<number> {
        const count = this.applications.length;
        this.applications = [];
        return count;
    }
}
