"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const PROJECT_NAME = 'operational-dashboard';
const ACTIVE_STATUSES = new Set(['In Production', 'In Development']);
class LoadPlanviewActiveApplications1781040600000 {
    constructor() {
        this.sourceFileName = 'PlanviewData_Dremio_CAI_Applications.json';
    }
    async up(db) {
        const collectionName = this.getCollectionName('applications');
        const sourceFilePath = node_path_1.default.resolve(__dirname, this.sourceFileName);
        const documents = await this.loadApplications(sourceFilePath);
        await this.createCollectionIfNotExists(db, collectionName);
        const collection = db.collection(collectionName);
        await collection.deleteMany({});
        await collection.createIndex({ planviewInternalId: 1 }, { unique: true });
        await collection.insertMany(documents, { ordered: false });
        console.log(`Loaded ${documents.length} active PlanView applications into ${collectionName}`);
    }
    async down(db) {
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
    getCollectionName(baseName) {
        return process.env.PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY === 'true'
            ? `${PROJECT_NAME.toLowerCase()}_${baseName}`
            : baseName;
    }
    async createCollectionIfNotExists(db, collectionName) {
        const collections = await db.listCollections({ name: collectionName }).toArray();
        if (!collections.length) {
            await db.createCollection(collectionName);
        }
    }
    async loadApplications(sourceFilePath) {
        const rawContent = await (0, promises_1.readFile)(sourceFilePath, 'utf8');
        const records = JSON.parse(this.normalizeRawExport(rawContent));
        const nowIso = new Date().toISOString();
        return records
            .filter((record) => ACTIVE_STATUSES.has(String(record.Status || '')))
            .filter((record) => record.ProductName && (record.CASTKey || record.ProductCode) && record.InternalID)
            .map((record) => this.mapApplication(record, nowIso));
    }
    normalizeRawExport(rawContent) {
        return rawContent.replace(/}\s*{/g, '},\n{');
    }
    parseTier(value) {
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
    parseCount(value) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : 0;
    }
    slugify(value, fallback = 'team-unassigned') {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return normalized || fallback;
    }
    mapApplication(record, nowIso) {
        const businessUnit = record.BusinessDeliveryPortfolioName || record.OwningOrganization || record.OpCo || 'Unknown';
        const environment = record.Status === 'In Development' ? 'DEVELOPMENT' : 'PRODUCTION';
        const currentUserCount = this.parseCount(record.InternalUserCount) + this.parseCount(record.ExternalUserCount);
        return {
            name: record.ProductName,
            shortCode: record.CASTKey || record.ProductCode,
            description: record.LongDescription || `${record.ProductName} imported from PlanView EA application export`,
            environment,
            tier: this.parseTier(record.DrTier),
            businessUnit,
            currentStatus: record.Status === 'In Development' ? 'AMBER' : 'GREEN',
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
            itOwner: record.ItOwner || null,
            itOwnerEmail: record.ItOwnerEmail || null,
            portfolioOwnerName: record.PortfolioOwnerName || null,
            portfolioOwnerEmail: record.PortfolioOwnerEmail || null,
            internalUserCount: this.parseCount(record.InternalUserCount),
            externalUserCount: this.parseCount(record.ExternalUserCount),
            dataClassification: record.DataClassification || null,
            hosting: record.Hosting || null,
            owningOrganization: record.OwningOrganization || null,
        };
    }
}
exports.default = LoadPlanviewActiveApplications1781040600000;
