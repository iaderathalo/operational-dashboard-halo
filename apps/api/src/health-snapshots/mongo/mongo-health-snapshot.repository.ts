import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { HealthSnapshotRepository } from '../health-snapshot.repository';

@Injectable()
export default class MongoHealthSnapshotRepository
    extends MongoRepository
    implements HealthSnapshotRepository
{
    collectionName = 'healthSnapshots';

    /**
     *
     * @param configService
     * @param logger
     */
    constructor(
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
    }

    /**
     *
     * @param snapshot
     */
    async insertSnapshot(snapshot: HealthSnapshot): Promise<void> {
        await (await this.getCollection<HealthSnapshot>(this.collectionName)).insertOne(snapshot);
    }

    /**
     *
     * @param applicationId
     * @param limit
     */
    async findRecentByApplicationId(
        applicationId: string,
        limit: number
    ): Promise<HealthSnapshot[]> {
        const docs = await (
            await this.getCollection<HealthSnapshot>(this.collectionName)
        )
            .find({ applicationId }, { projection: { _id: 0 } })
            .sort({ recordedAt: -1 })
            .limit(limit)
            .toArray();
        return docs as HealthSnapshot[];
    }

    /**
     *
     */
    async initDb() {
        await this.createCollectionIfNotExists();
        await this.createIndexes();
    }

    /**
     *
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
     *
     */
    private async createIndexes() {
        await (
            await this.getCollection<HealthSnapshot>(this.collectionName)
        ).createIndex({ applicationId: 1, recordedAt: -1 });
    }
}
