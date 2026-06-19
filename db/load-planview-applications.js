#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const PROJECT_NAME = 'operational-dashboard';
const ACTIVE_STATUSES = new Set(['In Production', 'In Development']);
const DRY_RUN = process.argv.includes('--dry-run') || process.env.PLANVIEW_DRY_RUN === 'true';
const REPLACE_COLLECTION = process.env.PLANVIEW_REPLACE_COLLECTION !== 'false';
const SOURCE_FILE =
    process.env.PLANVIEW_SOURCE_FILE ||
    path.join(__dirname, 'PlanviewData_Dremio_CAI_Applications.json');
const MONGO_URI =
    process.env.MONGODB_URI ||
    process.env.API_MONGODB_API_DB_URL ||
    process.env.API_MONGODB_DB_URL ||
    'mongodb://127.0.0.1:27018/operational_dashboard';

const getCollectionName = (baseName) =>
    process.env.PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY === 'true'
        ? `${PROJECT_NAME.toLowerCase()}_${baseName}`
        : baseName;

const slugify = (value, fallback = 'unassigned') => {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallback;
};

const parseTier = (value) => {
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
};

const parseCount = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
};

const normalizeRawExport = (rawContent) => rawContent.replace(/}\s*{/g, '},\n{');

const mapApplication = (record, nowIso) => {
    const businessUnit =
        record.BusinessDeliveryPortfolioName ||
        record.OwningOrganization ||
        record.OpCo ||
        'Unknown';
    const lifecycleStatus = record.Status === 'In Development' ? 'DEVELOPMENT' : 'PRODUCTION';
    const currentUserCount =
        parseCount(record.InternalUserCount) + parseCount(record.ExternalUserCount);

    return {
        name: record.ProductName,
        shortCode: record.CASTKey || record.ProductCode,
        description:
            record.LongDescription ||
            `${record.ProductName} imported from PlanView EA application export`,
        environment: lifecycleStatus,
        tier: parseTier(record.DrTier),
        businessUnit,
        currentStatus: 'GREEN',
        currentUserCount,
        monitoringSource: 'PlanView EA (pre-Datadog)',
        teamId: slugify(record.OwningOrganization || businessUnit, 'team-unassigned'),
        createdAt: nowIso,
        updatedAt: nowIso,
        planviewInternalId: record.InternalID,
        planviewProductCode: record.ProductCode,
        castKey: record.CASTKey || null,
        planviewApplicationUuid: record.CA_Application_UUID || null,
        serviceNowKey: record.ServiceNowKey || null,
        lifecycleStatus: record.Status,
        sourceSystem: 'PlanView EA',
        sourceFile: path.basename(SOURCE_FILE),
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
        amsServiceStatusApplicationEngineering: record.AMSSrvceSttsApplctnEngnrng || null,
        amsServiceStatusApplicationSupport: record.AMSSrvceSttsApplctnSpprt || null,
        amsServiceStatusDatabaseServices: record.AMSSrvceSttsDtbseSrvcs || null,
        amsServiceStatusItControls: record.AMSServiceStatusITControls || null,
        internalUserCount: parseCount(record.InternalUserCount),
        externalUserCount: parseCount(record.ExternalUserCount),
        dataClassification: record.DataClassification || null,
        hosting: record.Hosting || null,
        owningOrganization: record.OwningOrganization || null,
        // Preserve PlanView's structured hierarchy fields instead of flattening
        // them into `businessUnit`, so the dashboard can roll up by the source's
        // own taxonomy (operating company -> delivery portfolio) without re-deriving it.
        opCo: record.OpCo || null,
        businessDeliveryPortfolio: record.BusinessDeliveryPortfolioName || null,
    };
};

const loadApplicationsFromFile = () => {
    const rawContent = fs.readFileSync(SOURCE_FILE, 'utf8');
    const parsed = JSON.parse(normalizeRawExport(rawContent));
    const nowIso = new Date().toISOString();

    return parsed
        .filter((record) => ACTIVE_STATUSES.has(record.Status))
        .filter(
            (record) =>
                record.ProductName && (record.CASTKey || record.ProductCode) && record.InternalID
        )
        .map((record) => mapApplication(record, nowIso));
};

const main = async () => {
    const collectionName = getCollectionName('applications');
    const documents = loadApplicationsFromFile();

    if (DRY_RUN) {
        const byStatus = documents.reduce((acc, document) => {
            acc[document.lifecycleStatus] = (acc[document.lifecycleStatus] || 0) + 1;
            return acc;
        }, {});

        console.log(`Dry run: parsed ${documents.length} active PlanView applications.`);
        console.log(`Target collection: ${collectionName}`);
        console.log(`Status breakdown: ${JSON.stringify(byStatus)}`);
        console.log(
            `Sample records: ${JSON.stringify(
                documents.slice(0, 3).map((document) => ({
                    name: document.name,
                    shortCode: document.shortCode,
                    planviewInternalId: document.planviewInternalId,
                })),
                null,
                2
            )}`
        );
        return;
    }

    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection(collectionName);

        if (REPLACE_COLLECTION) {
            await collection.deleteMany({});
        }

        await collection.createIndex({ planviewInternalId: 1 }, { unique: true });
        await collection.insertMany(documents, { ordered: false });

        console.log(
            `Loaded ${documents.length} PlanView applications into ${db.databaseName}.${collectionName}`
        );
    } finally {
        await client.close();
    }
};

main().catch((error) => {
    console.error('Failed to load PlanView applications into MongoDB.', error);
    process.exitCode = 1;
});
