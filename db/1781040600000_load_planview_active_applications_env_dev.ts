import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { MigrationInterface } from 'mongo-migrate-ts';
import { Db } from 'mongodb';

const PROJECT_NAME = 'operational-dashboard';
const ACTIVE_STATUSES = new Set(['In Production', 'In Development']);

type PlanviewRecord = {
    ProductName?: string;
    CASTKey?: string;
    ProductCode?: string;
    LongDescription?: string;
    BusinessDeliveryPortfolioName?: string;
    OwningOrganization?: string;
    OpCo?: string;
    Status?: string;
    DrTier?: string;
    InternalUserCount?: number | string;
    ExternalUserCount?: number | string;
    InternalID?: string;
    CA_Application_UUID?: string;
    ServiceNowKey?: string;
    BusinessOwner?: string;
    BusinessOwnerEmail?: string;
    ItOwner?: string;
    ItOwnerEmail?: string;
    PortfolioOwnerName?: string;
    PortfolioOwnerEmail?: string;
    TechnicalContact?: string;
    TechnicalContactEmail?: string;
    PODName?: string;
    PODLead?: string;
    PODLeadEmail?: string;
    AMSServiceStatusMaintenance?: string;
    AMSSrvceSttsApplctnEngnrng?: string;
    AMSSrvceSttsApplctnSpprt?: string;
    AMSSrvceSttsDtbseSrvcs?: string;
    AMSServiceStatusITControls?: string;
    DataClassification?: string;
    Hosting?: string;
};

export default class LoadPlanviewActiveApplications1781040600000
    implements MigrationInterface
{
    private readonly sourceFileName = 'PlanviewData_Dremio_CAI_Applications.json';

    async up(db: Db): Promise<void> {
        const collectionName = this.getCollectionName('applications');
        const sourceFilePath = path.resolve(__dirname, this.sourceFileName);
        const documents = await this.loadApplications(sourceFilePath);

        await this.createCollectionIfNotExists(db, collectionName);

        const collection = db.collection(collectionName);
        await collection.deleteMany({});
        await collection.createIndex({ planviewInternalId: 1 }, { unique: true });
        await collection.insertMany(documents, { ordered: false });

        console.log(
            `Loaded ${documents.length} active PlanView applications into ${collectionName}`
        );
    }

    async down(db: Db): Promise<void> {
        const collectionName = this.getCollectionName('applications');
        const collections = await db.listCollections({ name: collectionName }).toArray();

        if (!collections.length) {
            console.log(`Collection ${collectionName} does not exist; nothing to rollback.`);
            return;
        }

        const result = await db.collection(collectionName).deleteMany({
            sourceSystem: 'PlanView EA',
            sourceFile: this.sourceFileName,
        });

        console.log(`Removed ${result.deletedCount} PlanView application documents from ${collectionName}`);
    }

    private getCollectionName(baseName: string): string {
        return process.env.PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY === 'true'
            ? `${PROJECT_NAME.toLowerCase()}_${baseName}`
            : baseName;
    }

    private async createCollectionIfNotExists(db: Db, collectionName: string): Promise<void> {
        const collections = await db.listCollections({ name: collectionName }).toArray();

        if (!collections.length) {
            await db.createCollection(collectionName);
        }
    }

    private async loadApplications(sourceFilePath: string): Promise<Record<string, unknown>[]> {
        const rawContent = await readFile(sourceFilePath, 'utf8');
        const records = JSON.parse(this.normalizeRawExport(rawContent)) as PlanviewRecord[];
        const nowIso = new Date().toISOString();

        return records
            .filter((record) => ACTIVE_STATUSES.has(String(record.Status || '')))
            .filter(
                (record) => record.ProductName && (record.CASTKey || record.ProductCode) && record.InternalID
            )
            .map((record) => this.mapApplication(record, nowIso));
    }

    private normalizeRawExport(rawContent: string): string {
        return rawContent.replace(/}\s*{/g, '},\n{');
    }

    private parseTier(value?: string): 1 | 2 | 3 | 4 {
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

    private parseCount(value?: number | string): number {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : 0;
    }

    private slugify(value?: string, fallback = 'team-unassigned'): string {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return normalized || fallback;
    }

    private mapApplication(record: PlanviewRecord, nowIso: string): Record<string, unknown> {
        const businessUnit =
            record.BusinessDeliveryPortfolioName || record.OwningOrganization || record.OpCo || 'Unknown';
        const environment = record.Status === 'In Development' ? 'DEVELOPMENT' : 'PRODUCTION';
        const currentUserCount =
            this.parseCount(record.InternalUserCount) + this.parseCount(record.ExternalUserCount);

        return {
            name: record.ProductName,
            shortCode: record.CASTKey || record.ProductCode,
            description:
                record.LongDescription || `${record.ProductName} imported from PlanView EA application export`,
            environment,
            tier: this.parseTier(record.DrTier),
            businessUnit,
            currentStatus: 'GREEN',
            currentUserCount,
            monitoringSource: 'PlanView EA (pre-Datadog)',
            teamId: this.slugify(record.OwningOrganization || businessUnit),
            createdAt: nowIso,
            updatedAt: nowIso,
            planviewInternalId: record.InternalID,
            planviewProductCode: record.ProductCode,
            castKey: record.CASTKey || null,
            planviewApplicationUuid: record.CA_Application_UUID || null,
            serviceNowKey: record.ServiceNowKey || null,
            lifecycleStatus: record.Status,
            sourceSystem: 'PlanView EA',
            sourceFile: this.sourceFileName,
            businessOwner: record.BusinessOwner || null,
            businessOwnerEmail: record.BusinessOwnerEmail || null,
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
            amsServiceStatusApplicationEngineering:
                record.AMSSrvceSttsApplctnEngnrng || null,
            amsServiceStatusApplicationSupport: record.AMSSrvceSttsApplctnSpprt || null,
            amsServiceStatusDatabaseServices: record.AMSSrvceSttsDtbseSrvcs || null,
            amsServiceStatusItControls: record.AMSServiceStatusITControls || null,
            internalUserCount: this.parseCount(record.InternalUserCount),
            externalUserCount: this.parseCount(record.ExternalUserCount),
            dataClassification: record.DataClassification || null,
            hosting: record.Hosting || null,
            owningOrganization: record.OwningOrganization || null,
        };
    }
}