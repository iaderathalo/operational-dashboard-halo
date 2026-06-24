import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, Db } from 'mongodb';

import DremioPortfolioClient, { DremioApplicationRecord } from './dremio-portfolio-client';
import MongoRepository from '../repository/mongo/mongo-repository';

const PROJECT_NAME = 'operational-dashboard';
const ACTIVE_STATUSES = new Set(['In Production', 'In Development']);

export interface PlanviewSyncSummary {
    totalFetched: number;
    activeFiltered: number;
    upserted: number;
    deactivated: number;
    durationMs: number;
    source: 'dremio' | 'file';
}

/** If the fetch returns fewer than this fraction of current active docs, skip deactivation. */
const DEACTIVATION_SAFETY_THRESHOLD = 0.5;

/**
 * PlanView portfolio sync service. Fetches application records from Dremio
 * (when USE_REAL_PLANVIEW=true) or from the static file (fallback), then
 * upserts them into Mongo BY planviewInternalId, preserving any Datadog-enriched
 * fields that the Datadog sync wrote onto the same documents.
 */
@Injectable()
export default class PlanviewSyncService extends MongoRepository {
    private readonly collectionName: string;

    private readonly useRealPlanview: boolean;

    /**
     *
     * @param dremioClient
     * @param configService
     * @param logger
     */
    constructor(
        @Inject(DremioPortfolioClient) private readonly dremioClient: DremioPortfolioClient,
        configService: ConfigService,
        public logger: Logger
    ) {
        super(configService, logger);
        this.useRealPlanview = configService.get<string>('USE_REAL_PLANVIEW') === 'true';
        this.collectionName =
            configService.get<string>('PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY') === 'true'
                ? `${PROJECT_NAME}_applications`
                : 'applications';
    }

    /**
     * Runs the full sync: fetch → filter → map → upsert.
     * @returns {Promise<PlanviewSyncSummary>} the sync result summary
     */
    async syncAll(): Promise<PlanviewSyncSummary> {
        const start = Date.now();
        let records: DremioApplicationRecord[];
        let source: 'dremio' | 'file';

        if (this.useRealPlanview) {
            this.logger.info('PlanView sync: fetching from Dremio');
            records = await this.dremioClient.fetchAllApplications();
            source = 'dremio';
        } else {
            this.logger.info('PlanView sync: reading from static file');
            records = await this.loadFromFile();
            source = 'file';
        }

        const activeRecords = records
            .filter((r) => ACTIVE_STATUSES.has(String(r.Status || '')))
            .filter((r) => r.ProductName && (r.CASTKey || r.ProductCode) && r.InternalID);

        this.logger.info('PlanView sync: upserting applications', {
            totalFetched: records.length,
            activeFiltered: activeRecords.length,
        });

        const nowIso = new Date().toISOString();
        const upserted = await this.upsertApplications(activeRecords, nowIso);
        const deactivated = await this.reconcileRemovedApps(activeRecords.length, nowIso);

        const summary: PlanviewSyncSummary = {
            totalFetched: records.length,
            activeFiltered: activeRecords.length,
            upserted,
            deactivated,
            durationMs: Date.now() - start,
            source,
        };

        this.logger.info('PlanView sync complete', summary as unknown as Record<string, unknown>);
        return summary;
    }

    /**
     * UPSERT by planviewInternalId. Only sets PlanView-sourced fields;
     * Datadog-enriched fields (healthStatus, uptime30d, monitors, etc.) are
     * left intact via $set (not $replaceRoot).
     * @param {DremioApplicationRecord[]} records - the active application records
     * @param nowIso
     * @returns {Promise<number>} count of modified + upserted documents
     */
    private async upsertApplications(
        records: DremioApplicationRecord[],
        nowIso: string
    ): Promise<number> {
        const collection = await this.getApplicationsCollection();

        await collection.createIndex({ planviewInternalId: 1 }, { unique: true });

        const bulkOps = records.map((record) => {
            const mapped = PlanviewSyncService.mapApplication(record, nowIso);
            return {
                updateOne: {
                    filter: { planviewInternalId: mapped.planviewInternalId },
                    update: {
                        $set: mapped,
                        $setOnInsert: { createdAt: nowIso },
                        $unset: { removedFromSourceAt: '' },
                    },
                    upsert: true,
                },
            };
        });

        // Execute in batches of 500 to avoid overwhelming Mongo
        const BATCH_SIZE = 500;
        let totalModified = 0;

        for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
            const batch = bulkOps.slice(i, i + BATCH_SIZE);
            // eslint-disable-next-line no-await-in-loop
            const result = await collection.bulkWrite(batch, { ordered: false });
            totalModified += result.upsertedCount + result.modifiedCount;
        }

        return totalModified;
    }

    /**
     * Deactivates PlanView apps not seen in this sync run. Scoped to
     * sourceSystem='PlanView EA' only. Skipped when the fetch looks
     * suspiciously small (safety guard against transient upstream failures).
     * @param {number} fetchedActiveCount - number of active records upserted
     * @param {string} nowIso - the run timestamp used as lastSeenInSourceAt
     * @returns {Promise<number>} count of deactivated documents
     */
    private async reconcileRemovedApps(
        fetchedActiveCount: number,
        nowIso: string
    ): Promise<number> {
        const collection = await this.getApplicationsCollection();

        // Safety guard: skip deactivation if the fetch is empty or suspiciously small
        if (fetchedActiveCount === 0) {
            this.logger.warn('PlanView reconciliation skipped: fetch returned 0 records');
            return 0;
        }

        const currentActiveCount = await collection.countDocuments({
            sourceSystem: 'PlanView EA',
            active: { $ne: false },
        });

        if (fetchedActiveCount < currentActiveCount * DEACTIVATION_SAFETY_THRESHOLD) {
            this.logger.warn('PlanView reconciliation skipped: fetched count is suspiciously low', {
                fetchedActiveCount,
                currentActiveCount,
                threshold: DEACTIVATION_SAFETY_THRESHOLD,
            });
            return 0;
        }

        const result = await collection.updateMany(
            {
                sourceSystem: 'PlanView EA',
                lastSeenInSourceAt: { $ne: nowIso },
            },
            {
                $set: {
                    active: false,
                    removedFromSourceAt: nowIso,
                    lifecycleStatus: 'Removed from source',
                },
            }
        );

        if (result.modifiedCount > 0) {
            this.logger.info('PlanView reconciliation: deactivated stale apps', {
                deactivated: result.modifiedCount,
            });
        }

        return result.modifiedCount;
    }

    /**
     * Returns the Mongo collection for applications.
     * @returns {Promise<Collection>} the applications collection
     */
    private async getApplicationsCollection(): Promise<Collection> {
        const db: Db = await this.getDatabase();
        return db.collection(this.collectionName);
    }

    /**
     * Loads PlanView records from the static JSON file.
     * @returns {Promise<DremioApplicationRecord[]>} the parsed records
     */
    // eslint-disable-next-line class-methods-use-this
    private async loadFromFile(): Promise<DremioApplicationRecord[]> {
        const filePath = path.resolve(
            __dirname,
            '../../../../db/PlanviewData_Dremio_CAI_Applications.json'
        );
        const rawContent = await readFile(filePath, 'utf8');
        const normalized = rawContent.replace(/}\s*{/g, '},{');
        return JSON.parse(normalized) as DremioApplicationRecord[];
    }

    /**
     * Derives the slug identifier for a team from the record.
     * @param {string | undefined | null} value - the string to slugify
     * @param {string} fallback - fallback when value is empty
     * @returns {string} the slugified string
     */
    private static slugify(value: string | undefined | null, fallback = 'team-unassigned'): string {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return normalized || fallback;
    }

    /**
     * Converts a DrTier string to a numeric priority.
     * @param {string} value - tier label from PlanView
     * @returns {1 | 2 | 3 | 4} the numeric priority
     */
    private static parseTier(value?: string): 1 | 2 | 3 | 4 {
        switch (String(value || '').trim()) {
            case 'Tier 0':
                return 1;
            case 'Tier 1':
                return 2;
            case 'Tier 2':
                return 3;
            case 'Tier 3':
                return 4;
            default:
                return 4;
        }
    }

    /**
     * Parses a numeric value from a field that may be string or number.
     * @param {number | string} value - the raw value
     * @returns {number} the parsed number, or 0 if invalid
     */
    private static parseCount(value?: number | string): number {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : 0;
    }

    /**
     * Maps a raw Dremio/PlanView record to the application document shape
     * stored in Mongo. Only PlanView-sourced fields — Datadog fields are
     * excluded so $set won't clobber them.
     * @param {DremioApplicationRecord} record - raw PlanView record
     * @param {string} nowIso - current ISO timestamp
     * @returns {Record<string, unknown>} the mapped application document
     */
    static mapApplication(
        record: DremioApplicationRecord,
        nowIso: string
    ): Record<string, unknown> {
        const businessUnit =
            record.BusinessDeliveryPortfolioName ||
            record.OwningOrganization ||
            record.OpCo ||
            'Unknown';
        const environment = record.Status === 'In Development' ? 'DEVELOPMENT' : 'PRODUCTION';
        const currentUserCount =
            PlanviewSyncService.parseCount(record.InternalUserCount) +
            PlanviewSyncService.parseCount(record.ExternalUserCount);

        return {
            name: record.ProductName,
            shortCode: record.CASTKey || record.ProductCode,
            description:
                record.LongDescription ||
                `${record.ProductName} imported from PlanView EA application export`,
            environment,
            tier: PlanviewSyncService.parseTier(record.DrTier),
            businessUnit,
            currentStatus: 'GREEN',
            currentUserCount,
            monitoringSource: 'PlanView EA (pre-Datadog)',
            teamId: PlanviewSyncService.slugify(record.OwningOrganization || businessUnit),
            active: true,
            lastSeenInSourceAt: nowIso,
            updatedAt: nowIso,
            planviewInternalId: record.InternalID,
            planviewProductCode: record.ProductCode,
            castKey: record.CASTKey || null,
            planviewApplicationUuid: record.CA_Application_UUID || null,
            serviceNowKey: record.ServiceNowKey || null,
            lifecycleStatus: record.Status,
            sourceSystem: 'PlanView EA',
            sourceFile: 'dremio-live',
            ...PlanviewSyncService.mapOwnerFields(record),
        };
    }

    /**
     * Maps owner, AMS, and supplementary fields from a PlanView record.
     * @param {DremioApplicationRecord} record - raw PlanView record
     * @returns {Record<string, unknown>} the mapped owner/supplementary fields
     */
    private static mapOwnerFields(record: DremioApplicationRecord): Record<string, unknown> {
        return {
            businessOwner: record.BusinessOwner || null,
            businessOwnerEmail: null,
            itOwner: record.ItOwner || null,
            itOwnerEmail: record.ItOwnerEmail || null,
            portfolioOwnerName: record.PortfolioOwnerName || null,
            portfolioOwnerEmail: record.PortfolioOwnerEmail || null,
            technicalContact: record.TechnicalContact || null,
            technicalContactEmail: record.TechnicalContactEmail || null,
            podName: record.PODName || null,
            podLead: record.PODLead || null,
            podLeadEmail: record.PODLeadEmail || null,
            amsServiceStatusMaintenance: record.AMSServiceStatusMaintenance || null,
            amsServiceStatusApplicationEngineering: record.AMSSrvceSttsApplctnEngnrng || null,
            amsServiceStatusApplicationSupport: record.AMSSrvceSttsApplctnSpprt || null,
            amsServiceStatusDatabaseServices: record.AMSSrvceSttsDtbseSrvcs || null,
            amsServiceStatusItControls: record.AMSServiceStatusITControls || null,
            internalUserCount: PlanviewSyncService.parseCount(record.InternalUserCount),
            externalUserCount: PlanviewSyncService.parseCount(record.ExternalUserCount),
            dataClassification: record.DataClassification || null,
            hosting: record.Hosting || null,
            owningOrganization: record.OwningOrganization || null,
            opCo: record.OpCo || null,
            businessDeliveryPortfolio: record.BusinessDeliveryPortfolioName || null,
        };
    }
}
