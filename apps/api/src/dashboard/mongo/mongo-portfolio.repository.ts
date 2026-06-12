import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DashboardDetailResponse } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { PortfolioAppContext, PortfolioNode } from '../portfolio.model';
import { PortfolioRepository } from '../portfolio.repository';
import createDashboardDetailResponse from '../seed/detail.seed';
import SEED_PORTFOLIO from '../seed/portfolio.seed';

type StoredDashboardDetail = DashboardDetailResponse & { appId: string };

const findAppContext = (
    appId: string,
    node: PortfolioNode,
    path: PortfolioNode[] = []
): PortfolioAppContext | null => {
    const matchingApp = (node.apps || []).find((app) => app.id === appId);

    if (matchingApp) {
        return {
            app: matchingApp,
            path: [...path, node],
        };
    }

    return (
        (node.children || [])
            .map((child) => findAppContext(appId, child, [...path, node]))
            .find((context): context is PortfolioAppContext => context !== null) || null
    );
};

/**
 * Flattens the portfolio tree into application contexts for detail seeding.
 * @param {object} node - current portfolio node
 * @param {object[]} path - accumulated node path to the current node
 * @returns {Promise<object[]>} application contexts for all descendant apps
 */
function collectAppContexts(
    node: PortfolioNode,
    path: PortfolioNode[] = []
): PortfolioAppContext[] {
    const currentPath = [...path, node];
    const appContexts = (node.apps || []).map((app) => ({
        app,
        path: currentPath,
    }));

    return [
        ...appContexts,
        ...(node.children || []).flatMap((child) => collectAppContexts(child, currentPath)),
    ];
}

@Injectable()
export default class MongoPortfolioRepository
    extends MongoRepository
    implements PortfolioRepository
{
    collectionName = 'dashboardPortfolio';

    detailsCollectionName = 'dashboardAppDetails';

    /**
     * Creates the Mongo-backed portfolio repository.
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
     * Returns the persisted dashboard portfolio tree.
     * @returns {Promise<object>} dashboard portfolio tree
     */
    async getPortfolio(): Promise<PortfolioNode> {
        const collection = await this.getCollection<PortfolioNode>(this.collectionName);
        const portfolio = await collection.findOne(
            { id: SEED_PORTFOLIO.id },
            { projection: { _id: 0 } }
        );

        if (portfolio) {
            return portfolio;
        }

        await this.populatePortfolioIfEmpty();

        return (await collection.findOne(
            { id: SEED_PORTFOLIO.id },
            { projection: { _id: 0 } }
        )) as PortfolioNode;
    }

    /**
     * Returns the detail context for a single application from the stored portfolio.
     * @param {string} appId - portfolio application id
     * @returns {Promise<object | null>} application context when found
     */
    async getAppContext(appId: string): Promise<PortfolioAppContext | null> {
        const portfolio = await this.getPortfolio();

        return findAppContext(appId, portfolio);
    }

    /**
     * Returns the stored detail payload for a single application.
     * Missing detail documents are generated once and persisted.
     * @param {string} appId - portfolio application id
     * @returns {Promise<object | null>} application detail payload when found
     */
    async getAppDetail(appId: string): Promise<DashboardDetailResponse | null> {
        const detailCollection = await this.getCollection<StoredDashboardDetail>(
            this.detailsCollectionName
        );
        const storedDetail = await detailCollection.findOne(
            { appId },
            { projection: { _id: 0, appId: 0 } }
        );

        if (storedDetail) {
            return storedDetail;
        }

        const context = await this.getAppContext(appId);

        if (!context) {
            return null;
        }

        const generatedDetail = createDashboardDetailResponse(context);

        await detailCollection.insertOne({
            appId,
            ...generatedDetail,
        });

        return generatedDetail;
    }

    /**
     * Ensures the dashboard portfolio collection exists and has seed data.
     * @returns {Promise<void>}
     */
    async initDb() {
        await this.createCollectionIfNotExists(this.collectionName);
        await this.populatePortfolioIfEmpty();
        await this.createCollectionIfNotExists(this.detailsCollectionName);
        await this.populateDetailsIfMissing();
    }

    /**
     * Creates a collection when it does not yet exist.
     * @param {string} collectionName - collection to create when missing
     * @returns {Promise<void>}
     */
    private async createCollectionIfNotExists(collectionName: string): Promise<void> {
        const collections = await this.database.listCollections().toArray();
        const exists = collections.find((collection) => collection.name === collectionName);

        if (!exists) {
            this.logger.info(`Creating collection [${collectionName}]`);
            await this.database.createCollection(collectionName);
        }
    }

    /**
     * Seeds the portfolio collection with the initial dashboard data when empty.
     * @returns {Promise<void>}
     */
    private async populatePortfolioIfEmpty(): Promise<void> {
        const collection = await this.getCollection<PortfolioNode>(this.collectionName);
        const count = await collection.countDocuments();

        if (count === 0) {
            this.logger.info(`Seeding [${this.collectionName}] with dashboard portfolio data`);
            await collection.insertOne(JSON.parse(JSON.stringify(SEED_PORTFOLIO)) as PortfolioNode);
        }
    }

    /**
     * Ensures a detail document exists for each application in the portfolio tree.
     * @returns {Promise<void>}
     */
    private async populateDetailsIfMissing(): Promise<void> {
        const detailCollection = await this.getCollection<StoredDashboardDetail>(
            this.detailsCollectionName
        );
        const existingDetails = await detailCollection
            .find({}, { projection: { _id: 0, appId: 1 } })
            .toArray();
        const existingAppIds = new Set(existingDetails.map((detail) => detail.appId));
        const portfolio = await this.getPortfolio();
        const missingDetails = collectAppContexts(portfolio)
            .filter((context) => !existingAppIds.has(context.app.id))
            .map((context) => ({
                appId: context.app.id,
                ...createDashboardDetailResponse(context),
            }));

        if (missingDetails.length > 0) {
            this.logger.info(
                `Seeding [${this.detailsCollectionName}] with [${missingDetails.length}] dashboard detail documents`
            );
            await detailCollection.insertMany(missingDetails);
        }
    }
}
