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

    /**
     * Finds a single incident by identifier.
     * @param {{ _id: string }} incidentId - wrapped incident identifier
     * @returns {Promise<object>} matching incident, if found
     */
    async findOne(incidentId): Promise<Incident> {
        const { _id: id } = incidentId;
        return this.incidents.find((i) => i.id === id) || null;
    }

    /**
     * Returns all incidents ordered by open time descending.
     * @returns {Promise<object[]>} all stored incidents
     */
    async findAll(): Promise<Incident[]> {
        return [...this.incidents].sort(
            (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
        );
    }

    /**
     * Returns incidents that match the provided filter set.
     * @param {object} filters - incident filter values
     * @param {string} [filters.status] - optional incident status filter
     * @param {string} [filters.severity] - optional incident severity filter
     * @param {string} [filters.applicationId] - optional application identifier filter
     * @returns {Promise<object[]>} matching incidents
     */
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

    /**
     * Returns active incidents for an application.
     * @param {string} applicationId - application identifier
     * @returns {Promise<object[]>} active incidents for the application
     */
    async findActiveByApplicationId(applicationId: string): Promise<Incident[]> {
        return this.incidents.filter(
            (i) =>
                i.applicationId === applicationId &&
                i.status !== 'RESOLVED' &&
                i.status !== 'CLOSED'
        );
    }

    /**
     * Replaces an existing incident record.
     * @param {{ _id: string }} incidentId - wrapped incident identifier
     * @param {object} entity - replacement incident payload
     * @returns {Promise<number>} 1 when the incident was updated, otherwise 0
     */
    async updateOne(incidentId, entity: Incident): Promise<number> {
        const { _id: id } = incidentId;
        const index = this.incidents.findIndex((i) => i.id === id);
        if (index === -1) return 0;
        this.incidents[index] = { ...entity, id };
        return 1;
    }

    /**
     * Deletes an incident record by identifier.
     * @param {{ _id: string }} incidentId - wrapped incident identifier
     * @returns {Promise<boolean>} true when the incident was deleted
     */
    async deleteOne(incidentId): Promise<boolean> {
        const { _id: id } = incidentId;
        const index = this.incidents.findIndex((i) => i.id === id);
        if (index === -1) return false;
        this.incidents.splice(index, 1);
        return true;
    }

    /**
     * Creates an incident record.
     * @param {object} incident - incident payload to create
     * @returns {Promise<string>} generated incident identifier
     */
    async create(incident: Incident): Promise<string> {
        const id = uuidv4();
        this.incidents.push({ ...incident, id });
        return id;
    }

    /**
     * Deletes all incident records.
     * @returns {Promise<number>} number of removed incidents
     */
    async deleteAll(): Promise<number> {
        const count = this.incidents.length;
        this.incidents = [];
        return count;
    }
}
