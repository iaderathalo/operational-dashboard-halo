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

    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    async findOne(incidentId): Promise<Incident> {
        const { _id: id } = incidentId;
        const incident = await (
            await this.getCollection<Incident>(this.collectionName)
        ).findOne({ _id: ObjectId.createFromHexString(id) });

        return incident ? toIncident(incident as Incident & MongoDbId) : null;
    }

    async findAll(): Promise<Incident[]> {
        const incidents = await (await this.getCollection<Incident>(this.collectionName))
            .find()
            .sort({ openedAt: -1 })
            .toArray();

        return incidents.map((incident) => toIncident(incident as Incident & MongoDbId));
    }

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

    async findActiveByApplicationId(applicationId: string): Promise<Incident[]> {
        return this.findByFilters({
            applicationId,
            status: 'OPEN',
        });
    }

    async updateOne(incidentId, entity: Incident): Promise<number> {
        const { _id: id } = incidentId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).findOneAndReplace({ _id: ObjectId.createFromHexString(id) }, entity);
        return resp?._id ? 1 : 0;
    }

    async deleteOne(incidentId): Promise<boolean> {
        const { _id: id } = incidentId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).deleteOne({ _id: ObjectId.createFromHexString(id) });
        return Boolean(resp.deletedCount);
    }

    async create(incident: Incident): Promise<object> {
        const resp = await (
            await this.getCollection<Incident>(this.collectionName)
        ).insertOne({ ...incident });
        return resp.insertedId;
    }

    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.collectionName)).deleteMany({});
        return resp.deletedCount;
    }

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
