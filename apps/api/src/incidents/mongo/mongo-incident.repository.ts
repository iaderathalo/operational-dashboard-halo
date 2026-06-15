/* eslint-disable no-underscore-dangle */
import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import { Incident } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { IncidentRepository } from '../incident.repository';
import SEED_INCIDENTS from '../seed/incidents.seed';

type MongoDbId = Record<'_id', ObjectId | string>;

const toIncident = (incident: Incident & MongoDbId): Incident => {
    const { _id: mongoId, ...rest } = incident;
    return { ...rest, id: String(mongoId) };
};

@Injectable()
export default class MongoIncidentRepository extends MongoRepository implements IncidentRepository {
    collectionName = 'incidents';

    /**
     * Creates the Mongo-backed incident repository.
     * @param {object} configService - configuration service for database settings
     * @param {object} logger - logger used for repository diagnostics
     */
    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    /**
     * Finds a single incident by identifier.
     * @param {{ _id: string }} incidentId - wrapped incident identifier
     * @returns {Promise<object>} matching incident, if found
     */
    async findOne(incidentId): Promise<Incident> {
        const { _id: id } = incidentId;
        const incident = await (
            await this.getCollection<Incident>(this.collectionName)
        ).findOne({ _id: ObjectId.createFromHexString(id) });

        return incident ? toIncident(incident as Incident & MongoDbId) : null;
    }

    /**
     * Returns all incidents ordered by open time descending.
     * @returns {Promise<object[]>} all stored incidents
     */
    async findAll(): Promise<Incident[]> {
        const incidents = await (await this.getCollection<Incident>(this.collectionName))
            .find()
            .sort({ openedAt: -1 })
            .toArray();

        return incidents.map((incident) => toIncident(incident as Incident & MongoDbId));
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
        const query: Record<string, unknown> = {};
        if (filters.status) query.status = filters.status;
        if (filters.severity) query.severity = filters.severity;
        if (filters.applicationId) query.applicationId = filters.applicationId;

        const incidents = await (await this.getCollection<Incident>(this.collectionName))
            .find(query)
            .sort({ openedAt: -1 })
            .toArray();

        return incidents.map((incident) => toIncident(incident as Incident & MongoDbId));
    }

    /**
     * Returns active incidents for an application.
     * @param {string} applicationId - application identifier
     * @returns {Promise<object[]>} active incidents for the application
     */
    async findActiveByApplicationId(applicationId: string): Promise<Incident[]> {
        return this.findByFilters({
            applicationId,
            status: 'OPEN',
        });
    }

    /**
     * Replaces an existing incident document.
     * @param {{ _id: string }} incidentId - wrapped incident identifier
     * @param {object} entity - replacement incident payload
     * @returns {Promise<number>} 1 when the incident was updated, otherwise 0
     */
    async updateOne(incidentId, entity: Incident): Promise<number> {
        const { _id: id } = incidentId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).findOneAndReplace({ _id: ObjectId.createFromHexString(id) }, entity);
        return resp?._id ? 1 : 0;
    }

    /**
     * Deletes an incident document by identifier.
     * @param {{ _id: string }} incidentId - wrapped incident identifier
     * @returns {Promise<boolean>} true when the incident was deleted
     */
    async deleteOne(incidentId): Promise<boolean> {
        const { _id: id } = incidentId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).deleteOne({ _id: ObjectId.createFromHexString(id) });
        return Boolean(resp.deletedCount);
    }

    /**
     * Creates an incident document.
     * @param {object} incident - incident payload to create
     * @returns {Promise<object>} inserted Mongo identifier
     */
    async create(incident: Incident): Promise<object> {
        const resp = await (
            await this.getCollection<Incident>(this.collectionName)
        ).insertOne({ ...incident });
        return resp.insertedId;
    }

    /**
     * Deletes all incident documents.
     * @returns {Promise<number>} number of removed incident documents
     */
    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.collectionName)).deleteMany({});
        return resp.deletedCount;
    }

    /**
     * Initializes the incidents collection and seeds it when empty.
     * @returns {Promise<void>}
     */
    async initDb() {
        const collections = await this.database.listCollections().toArray();
        const exists = collections.find((c) => c.name === this.collectionName);
        if (!exists) {
            this.logger.info(`Creating collection [${this.collectionName}]`);
            await this.database.createCollection(this.collectionName);
        }

        const collection = await this.getCollection<Incident>(this.collectionName);
        const count = await collection.countDocuments();
        if (count === 0) {
            this.logger.info(`Seeding [${this.collectionName}] with sample data`);
            await collection.insertMany(SEED_INCIDENTS as Incident[]);
        }
    }
}
