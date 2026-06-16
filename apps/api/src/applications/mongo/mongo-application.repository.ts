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
type ApplicationFilters = {
    id?: string;
    status?: string;
    tier?: number;
    businessUnit?: string;
    search?: string;
    ownerEmail?: string;
};

@Injectable()
export default class MongoApplicationRepository
    extends MongoRepository
    implements ApplicationRepository
{
    collectionName = 'applications';

    /**
     * Creates the Mongo-backed application repository.
     * @param {object} configService - configuration service for database settings
     * @param {object} logger - Polaris logger instance
     */
    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    /**
     * Finds a single application by Mongo identifier.
     * @param {{ _id: string }} appId - wrapped application id value
     * @returns {Promise<object>} matching application payload
     */
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
                    datadogServiceId: 1,
                    datadogNamespace: 1,
                    datadogAppName: 1,
                    healthStatus: 1,
                    datadogMapped: 1,
                    uptime24h: 1,
                    uptime7d: 1,
                    uptime30d: 1,
                    slaTarget: 1,
                    errorBudgetRemainingPct: 1,
                    lastSyncAt: 1,
                    lastSyncStatus: 1,
                    resolutionPath: 1,
                },
            }
        );
        return app;
    }

    /**
     * Returns all stored applications.
     * @returns {Promise<object[]>} list of stored applications
     */
    async findAll(): Promise<Application[]> {
        const apps = await (await this.getCollection<Application>(this.collectionName))
            .find()
            .toArray();

        return apps.map((app: Application & MongoDbId) =>
            MongoApplicationRepository.toApplication(app)
        );
    }

    /**
     * Finds applications matching the provided filter set.
     * @param {object} filters - incoming application filter values
     * @returns {Promise<object[]>} matching application payloads
     */
    async findByFilters(filters: ApplicationFilters): Promise<Application[]> {
        const query = MongoApplicationRepository.buildFiltersQuery(filters);
        const apps = await (await this.getCollection<Application>(this.collectionName))
            .find(query)
            .toArray();

        return apps.map((app: Application & MongoDbId) =>
            MongoApplicationRepository.toApplication(app)
        );
    }

    /**
     * Replaces a single application document by Mongo identifier.
     * @param {{ _id: string }} appId - wrapped application id value
     * @param {Application} entity - replacement application payload
     * @returns {Promise<number>} 1 when the document was replaced, otherwise 0
     */
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

    /**
     * Applies a partial health update using $set so a Crawler write never clobbers
     * unrelated fields (name, tier, statusOverride) the way findOneAndReplace would.
     * @param {{ _id: string }} appId - wrapped application id value
     * @param {Partial<Application>} health - health fields to set
     * @returns {Promise<number>} 1 when a document matched, otherwise 0
     */
    async updateHealth(appId, health: Partial<Application>): Promise<number> {
        const { _id: id } = appId;
        const resp = await (
            await this.getCollection<Application>(this.collectionName)
        ).updateOne(
            { _id: ObjectId.createFromHexString(id) },
            { $set: { ...health, updatedAt: new Date().toISOString() } }
        );
        return resp.matchedCount;
    }

    /**
     * Deletes a single application document by Mongo identifier.
     * @param {{ _id: string }} appId - wrapped application id value
     * @returns {Promise<boolean>} true when a document was deleted
     */
    async deleteOne(appId): Promise<boolean> {
        const { _id: id } = appId;
        const resp = await (
            await this.getCollection(this.collectionName)
        ).deleteOne({ _id: ObjectId.createFromHexString(id) });
        return Boolean(resp.deletedCount);
    }

    /**
     * Creates an application document.
     * @param {Application} app - application payload to insert
     * @returns {Promise<object>} inserted Mongo identifier
     */
    async create(app: Application): Promise<object> {
        const now = new Date().toISOString();
        const resp = await (
            await this.getCollection<Application>(this.collectionName)
        ).insertOne({ ...app, createdAt: now, updatedAt: now });
        return resp.insertedId;
    }

    /**
     * Deletes all application documents.
     * @returns {Promise<number>} number of removed application documents
     */
    async deleteAll(): Promise<number> {
        const resp = await (await this.getCollection(this.collectionName)).deleteMany({});
        return resp.deletedCount;
    }

    /**
     * Initializes the applications collection and seeds sample data when appropriate.
     * @returns {Promise<void>}
     */
    async initDb() {
        await this.createCollectionIfNotExists();
        await this.populateIfEmpty();
    }

    /**
     * Builds the Mongo query used for filtered application searches.
     * @param {object} filters - incoming filter values
     * @returns {object} Mongo query document
     */
    private static buildFiltersQuery(filters: ApplicationFilters): Record<string, unknown> {
        let query: Record<string, unknown> = {};

        if (filters.id) {
            query._id = ObjectId.createFromHexString(filters.id);
        }
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
        if (filters.ownerEmail) {
            query = MongoApplicationRepository.applyOwnerEmailFilter(query, filters.ownerEmail);
        }

        return query;
    }

    /**
     * Applies owner-email filtering to a Mongo query.
     * @param {object} query - base Mongo query object
     * @param {string} ownerEmail - owner email to match case-insensitively
     * @returns {object} query including owner-email filtering
     */
    private static applyOwnerEmailFilter(
        query: Record<string, unknown>,
        ownerEmail: string
    ): Record<string, unknown> {
        const ownerEmailQuery = {
            $or: [
                { itOwnerEmail: { $regex: `^${ownerEmail}$`, $options: 'i' } },
                { portfolioOwnerEmail: { $regex: `^${ownerEmail}$`, $options: 'i' } },
            ],
        };

        if (query.$or) {
            const { $or: existingOr, ...remainingQuery } = query;

            return {
                ...remainingQuery,
                $and: [{ $or: existingOr as unknown[] }, ownerEmailQuery],
            };
        }

        return {
            ...query,
            ...ownerEmailQuery,
        };
    }

    /**
     * Converts a Mongo application document into the API response shape.
     * @param {Application & MongoDbId} app - Mongo application document
     * @returns {Application} normalized application payload
     */
    private static toApplication(app: Application & MongoDbId): Application {
        const id = String(app._id);
        const application = { ...app };
        delete application._id;
        return { ...application, id };
    }

    /**
     * Creates the applications collection if it does not already exist.
     * @returns {Promise<void>}
     */
    private async createCollectionIfNotExists() {
        const collections = await this.database.listCollections().toArray();
        const exists = collections.find((c) => c.name === this.collectionName);

        if (!exists) {
            this.logger.info(`Creating collection [${this.collectionName}]`);
            await this.database.createCollection(this.collectionName);
        }
    }

    /**
     * Seeds the applications collection when empty and sample data is allowed.
     * @returns {Promise<void>}
     */
    private async populateIfEmpty() {
        const collection = await this.getCollection<Application>(this.collectionName);
        const count = await collection.countDocuments();
        const useRealData = process.env.USE_REAL_DATA === 'true';

        if (count === 0) {
            if (useRealData) {
                this.logger.info(
                    `[${this.collectionName}] is empty while USE_REAL_DATA=true; skipping sample-data seed`
                );
                return;
            }

            this.logger.info(`Seeding [${this.collectionName}] with sample data`);
            await collection.insertMany(SEED_APPLICATIONS as Application[]);
        }
    }
}
