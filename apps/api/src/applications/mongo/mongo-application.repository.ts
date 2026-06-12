/* eslint-disable no-underscore-dangle */
import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { ApplicationRepository } from '../application.repository';
import SEED_APPLICATIONS from '../seed/applications.seed';

type MongoDbId = Record<'_id', ObjectId | string>;

@Injectable()
export default class MongoApplicationRepository
    extends MongoRepository
    implements ApplicationRepository
{
    collectionName = 'applications';

    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    async findOne(appId): Promise<Application> {
        const { _id: id } = appId;
        const app = await (
            await this.getCollection<Application>(this.collectionName)
        ).findOne(
            { _id: ObjectId.createFromHexString(id) },
            {
                projection: {
                    _id: 0,
                    id: { $toString: '$_id' },
                    name: 1,
                    shortCode: 1,
                    description: 1,
                    environment: 1,
                    tier: 1,
                    businessUnit: 1,
                    currentStatus: 1,
                    currentUserCount: 1,
                    monitoringSource: 1,
                    teamId: 1,
                    statusOverride: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
            }
        );
        return app;
    }

    async findAll(): Promise<Application[]> {
        const apps = await (await this.getCollection<Application>(this.collectionName))
            .find()
            .toArray();

        return apps.map((app: Application & MongoDbId) => {
            const id = String(app._id);
            // eslint-disable-next-line no-param-reassign
            delete app._id;
            return { ...app, id };
        });
    }

    async findByFilters(filters: {
        status?: string;
        tier?: number;
        businessUnit?: string;
        search?: string;
    }): Promise<Application[]> {
        const query: Record<string, unknown> = {};

        if (filters.status) {
            query.currentStatus = filters.status;
        }
        if (filters.tier) {
            query.tier = filters.tier;
        }
        if (filters.businessUnit) {
            query.businessUnit = filters.businessUnit;
        }
        if (filters.search) {
            query.$or = [
                { name: { $regex: filters.search, $options: 'i' } },
                { shortCode: { $regex: filters.search, $options: 'i' } },
                { description: { $regex: filters.search, $options: 'i' } },
            ];
        }

        const apps = await (await this.getCollection<Application>(this.collectionName))
            .find(query)
            .toArray();

        return apps.map((app: Application & MongoDbId) => {
            const id = String(app._id);
            // eslint-disable-next-line no-param-reassign
            delete app._id;
            return { ...app, id };
        });
    }

    async updateOne(appId, entity: Application): Promise<number> {
        const { _id: id } = appId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).findOneAndReplace(
            { _id: ObjectId.createFromHexString(id) },
            { ...entity, updatedAt: new Date().toISOString() }
        );
        return resp?._id ? 1 : 0;
    }

    async deleteOne(appId): Promise<boolean> {
        const { _id: id } = appId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).deleteOne({ _id: ObjectId.createFromHexString(id) });
        return Boolean(resp.deletedCount);
    }

    async create(app: Application): Promise<object> {
        const now = new Date().toISOString();
        const resp = await (
            await this.getCollection<Application>(this.collectionName)
        ).insertOne({ ...app, createdAt: now, updatedAt: now });
        return resp.insertedId;
    }

    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.collectionName)).deleteMany({});
        return resp.deletedCount;
    }

    async initDb() {
        await this.createCollectionIfNotExists();
        await this.populateIfEmpty();
    }

    private async createCollectionIfNotExists() {
        const collections = await this.database.listCollections().toArray();
        const exists = collections.find((c) => c.name === this.collectionName);

        if (!exists) {
            this.logger.info(`Creating collection [${this.collectionName}]`);
            await this.database.createCollection(this.collectionName);
        }
    }

    private async populateIfEmpty() {
        const collection = await this.getCollection<Application>(this.collectionName);
        const count = await collection.countDocuments();

        if (count === 0) {
            this.logger.info(`Seeding [${this.collectionName}] with sample data`);
            await collection.insertMany(SEED_APPLICATIONS as Application[]);
        }
    }
}
