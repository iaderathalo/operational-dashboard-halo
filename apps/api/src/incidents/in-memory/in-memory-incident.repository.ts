import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { Incident } from '@operational-dashboard/shared-api-model/model/dashboard';

import { IncidentRepository } from '../incident.repository';
import SEED_INCIDENTS from '../seed/incidents.seed';

@Injectable()
export default class InMemoryIncidentRepository implements IncidentRepository {
    private incidents: Incident[] = SEED_INCIDENTS.map((inc) => ({
        ...inc,
        id: uuidv4(),
    }));

    async findOne(incidentId): Promise<Incident> {
        const { _id: id } = incidentId;
        return this.incidents.find((i) => i.id === id) || null;
    }

    async findAll(): Promise<Incident[]> {
        return [...this.incidents].sort(
            (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
        );
    }

    async findByFilters(filters: {
        status?: string;
        severity?: string;
        applicationId?: string;
    }): Promise<Incident[]> {
        let result = [...this.incidents];

        if (filters.status) {
            result = result.filter((i) => i.status === filters.status);
        }
        if (filters.severity) {
            result = result.filter((i) => i.severity === filters.severity);
        }
        if (filters.applicationId) {
            result = result.filter((i) => i.applicationId === filters.applicationId);
        }

        return result.sort(
            (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
        );
    }

    async findActiveByApplicationId(applicationId: string): Promise<Incident[]> {
        return this.incidents.filter(
            (i) =>
                i.applicationId === applicationId &&
                i.status !== 'RESOLVED' &&
                i.status !== 'CLOSED'
        );
    }

    async updateOne(incidentId, entity: Incident): Promise<number> {
        const { _id: id } = incidentId;
        const index = this.incidents.findIndex((i) => i.id === id);
        if (index === -1) return 0;
        this.incidents[index] = { ...entity, id };
        return 1;
    }

    async deleteOne(incidentId): Promise<boolean> {
        const { _id: id } = incidentId;
        const index = this.incidents.findIndex((i) => i.id === id);
        if (index === -1) return false;
        this.incidents.splice(index, 1);
        return true;
    }

    async create(incident: Incident): Promise<string> {
        const id = uuidv4();
        this.incidents.push({ ...incident, id });
        return id;
    }

    async deleteAll(): Promise<number> {
        const count = this.incidents.length;
        this.incidents = [];
        return count;
    }
}
