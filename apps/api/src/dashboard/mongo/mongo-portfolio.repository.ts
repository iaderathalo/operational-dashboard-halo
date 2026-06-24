/* eslint-disable max-lines */
import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import {
    DashboardDetailResponse,
    DigestSummary,
    PortfolioRollup,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { PortfolioAppContext, PortfolioNode, PortfolioNodeRollup } from '../portfolio.model';
import { PortfolioRepository } from '../portfolio.repository';
import { StoredApplication } from './mongo-portfolio.types';
import { PortfolioBuilderUtility } from './portfolio-builder.utility';
import createDashboardDetailResponse from '../seed/detail.seed';

/** Fields needed for the portfolio tree build (excludes large arrays for per-app detail). */
const PORTFOLIO_PROJECTION = {
    _id: 1,
    name: 1,
    opCo: 1,
    businessDeliveryPortfolio: 1,
    businessUnit: 1,
    active: 1,
    datadogMapped: 1,
    healthStatus: 1,
    uptime30d: 1,
    slaTarget: 1,
    errorBudgetRemainingPct: 1,
    resolutionPath: 1,
    lastSyncStatus: 1,
    lastSyncAt: 1,
    monitors: 1,
    syntheticChecks: 1,
    currentUserCount: 1,
    internalUserCount: 1,
    externalUserCount: 1,
    itOwner: 1,
    itOwnerEmail: 1,
    portfolioOwnerName: 1,
    portfolioOwnerEmail: 1,
    businessOwner: 1,
    businessOwnerEmail: 1,
    technicalContact: 1,
    technicalContactEmail: 1,
    podName: 1,
    podLead: 1,
    podLeadEmail: 1,
    amsServiceStatusMaintenance: 1,
    amsServiceStatusApplicationEngineering: 1,
    amsServiceStatusApplicationSupport: 1,
    amsServiceStatusDatabaseServices: 1,
    amsServiceStatusItControls: 1,
} as const;

/** Cache entry for a built portfolio tree. */
interface PortfolioCacheEntry {
    tree: PortfolioNode;
    maxSyncAt: string | null;
    createdAt: number;
}

/** Default TTL for the portfolio cache (60 seconds). */
const CACHE_TTL_MS = 60_000;

@Injectable()
export default class MongoPortfolioRepository
    extends MongoRepository
    implements PortfolioRepository
{
    applicationsCollectionName = 'applications';

    /** Operating-company allowlist (lowercased) from PORTFOLIO_OPCO_ALLOWLIST; empty = all OpCos. */
    private readonly opCoAllowlist: string[];

    /** In-memory cache keyed by scope (undefined → '__all__', email → lowercased email). */
    private readonly portfolioCache = new Map<string, PortfolioCacheEntry>();

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
        this.opCoAllowlist = (configService.get<string>('PORTFOLIO_OPCO_ALLOWLIST') || '')
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);
    }

    /**
     * Returns the persisted dashboard portfolio tree.
     * @param {string} [userEmail] - optional email used to scope the portfolio to owned applications
     * @returns {Promise<object>} dashboard portfolio tree
     */
    async getPortfolio(userEmail?: string): Promise<PortfolioNode> {
        const cacheKey = MongoPortfolioRepository.cacheKey(userEmail);
        const cached = this.portfolioCache.get(cacheKey);

        if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
            const currentMax = await this.getMaxSyncAt(userEmail);
            if (currentMax === cached.maxSyncAt) {
                return cached.tree;
            }
        }

        const applications = await this.getApplications(userEmail);
        const tree = MongoPortfolioRepository.buildPortfolio(
            applications,
            userEmail,
            this.opCoAllowlist
        );

        const maxSyncAt =
            applications
                .map((a) => a.lastSyncAt || null)
                .filter((v): v is string => Boolean(v))
                .sort()
                .pop() || null;

        this.portfolioCache.set(cacheKey, { tree, maxSyncAt, createdAt: Date.now() });

        return tree;
    }

    /**
     * Builds the executive weekly digest from already-stored data — NO new Datadog
     * call (11-4). Reads the same scoped set the portfolio uses and derives the
     * leadership roll-up (reusing 11-1's computeRollup) plus a freshness stamp on read,
     * exactly as 7-2 derives maturity. Week-over-week movers need a prior period that
     * does not exist yet, so the digest honestly degrades to a point-in-time snapshot
     * (priorPeriod=null, empty movers).
     * @param {string} [userEmail] - optional email used to scope the digest to owned apps
     * @returns {Promise<object>} the derived digest summary
     */
    async getDigest(userEmail?: string): Promise<DigestSummary> {
        const applications = await this.getApplications(userEmail);

        return MongoPortfolioRepository.buildDigest(applications, userEmail);
    }

    /**
     * Returns the detail context for a single application from the stored portfolio.
     * Uses a single-document lookup instead of loading the full collection.
     * @param {string} appId - portfolio application id
     * @param {string} [userEmail] - optional email used to scope the portfolio to owned applications
     * @returns {Promise<object | null>} application context when found
     */
    async getAppContext(appId: string, userEmail?: string): Promise<PortfolioAppContext | null> {
        const application = await this.getApplicationById(appId, userEmail);

        if (!application) {
            return null;
        }

        return MongoPortfolioRepository.buildSingleAppContext(application, this.opCoAllowlist);
    }

    /**
     * Returns the stored detail payload for a single application.
     * Uses a single-document lookup instead of loading the full collection.
     * @param {string} appId - portfolio application id
     * @param {string} [userEmail] - optional email used to scope the portfolio to owned applications
     * @returns {Promise<object | null>} application detail payload when found
     */
    async getAppDetail(appId: string, userEmail?: string): Promise<DashboardDetailResponse | null> {
        const context = await this.getAppContext(appId, userEmail);

        if (!context) {
            return null;
        }

        return createDashboardDetailResponse(context);
    }

    /**
     * Ensures the dashboard portfolio collection exists and creates indexes.
     * @returns {Promise<void>}
     */
    async initDb() {
        this.logger.info('Mongo portfolio repository initialized for real application data');

        const collection = await this.getCollection<StoredApplication>(
            this.applicationsCollectionName
        );

        await Promise.all([
            collection.createIndex({ active: 1 }),
            collection.createIndex(
                { itOwnerEmail: 1 },
                { collation: { locale: 'en', strength: 2 } }
            ),
            collection.createIndex(
                { portfolioOwnerEmail: 1 },
                { collation: { locale: 'en', strength: 2 } }
            ),
            collection.createIndex({ active: 1, opCo: 1 }),
        ]);

        this.logger.info('MongoDB indexes ensured for applications collection');
    }

    /** Invalidates the portfolio cache for all scopes. */
    invalidateCache(): void {
        this.portfolioCache.clear();
    }

    /**
     * Fetches a single application by its _id, applying owner-scope if needed.
     * @param {string} appId - the string representation of the MongoDB _id
     * @param {string} [userEmail] - optional email used to filter owned applications
     * @returns {Promise<object | null>} the matching application document or null
     */
    private async getApplicationById(
        appId: string,
        userEmail?: string
    ): Promise<StoredApplication | null> {
        const query: Record<string, unknown> = {
            _id: ObjectId.isValid(appId) ? new ObjectId(appId) : appId,
            active: { $ne: false },
        };

        if (userEmail) {
            query.$or = [
                { itOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
                { portfolioOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
            ];
        }

        return (
            await this.getCollection<StoredApplication>(this.applicationsCollectionName)
        ).findOne(query);
    }

    /**
     * Loads applications from MongoDB, optionally scoped to a specific user.
     * Uses projection to avoid loading unnecessary fields.
     * @param {string} [userEmail] - optional email used to filter owned applications
     * @returns {Promise<object[]>} stored applications matching the query
     */
    private async getApplications(userEmail?: string): Promise<StoredApplication[]> {
        const query: Record<string, unknown> = { active: { $ne: false } };

        if (userEmail) {
            query.$or = [
                { itOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
                { portfolioOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
            ];
        }

        return (await this.getCollection<StoredApplication>(this.applicationsCollectionName))
            .find(query, { projection: PORTFOLIO_PROJECTION })
            .toArray();
    }

    /**
     * Returns the max lastSyncAt value for the scoped set (cheap aggregation for cache check).
     * @param {string} [userEmail] - optional email used to filter owned applications
     * @returns {Promise<string | null>} the latest lastSyncAt or null
     */
    private async getMaxSyncAt(userEmail?: string): Promise<string | null> {
        const query: Record<string, unknown> = { active: { $ne: false } };

        if (userEmail) {
            query.$or = [
                { itOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
                { portfolioOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
            ];
        }

        const result = await (
            await this.getCollection<StoredApplication>(this.applicationsCollectionName)
        )
            .find(query, { projection: { lastSyncAt: 1 }, sort: { lastSyncAt: -1 }, limit: 1 })
            .toArray();

        return result[0]?.lastSyncAt || null;
    }

    /**
     * Builds the PortfolioAppContext for a single application without loading the full tree.
     * Reconstructs just the hierarchy path (root → OpCo → BU → LOB) for the one app.
     * @param {object} application - the stored application document
     * @param {string[]} opCoAllowlist - lowercased OpCo allowlist
     * @returns {object | null} the app context with path, or null if filtered by allowlist
     */
    private static buildSingleAppContext(
        application: StoredApplication,
        opCoAllowlist: string[]
    ): PortfolioAppContext | null {
        const opCo = PortfolioBuilderUtility.opCoOf(application);

        // If OpCo allowlist is active and this app's OpCo isn't in it, treat as not found.
        if (opCoAllowlist.length && !opCoAllowlist.includes(opCo.toLowerCase())) {
            return null;
        }

        const businessUnit = PortfolioBuilderUtility.businessUnitOf(application);
        const lob = PortfolioBuilderUtility.lobOf(application);
        const portfolioApp = MongoPortfolioRepository.toPortfolioApp(application);

        const lobNode: PortfolioNode = {
            id: `lob-${PortfolioBuilderUtility.slugify(`${opCo}-${businessUnit}-${lob}`)}`,
            name: lob,
            role: 'LOB',
            owner: application.itOwner || lob,
            children: [],
            apps: [portfolioApp],
        };

        const buNode: PortfolioNode = {
            id: `business-unit-${PortfolioBuilderUtility.slugify(`${opCo}-${businessUnit}`)}`,
            name: businessUnit,
            role: 'Business Unit',
            owner: application.portfolioOwnerName || businessUnit,
            children: [lobNode],
            apps: [],
        };

        const opCoNode: PortfolioNode = {
            id: `opco-${PortfolioBuilderUtility.slugify(opCo)}`,
            name: opCo,
            role: 'Operating Company',
            owner: application.portfolioOwnerName || opCo,
            children: [buNode],
            apps: [],
        };

        const root: PortfolioNode = {
            id: 'application-portfolio',
            name: 'Application Portfolio',
            role: 'Portfolio',
            owner: 'All Applications',
            children: [opCoNode],
            apps: [],
        };

        return { app: portfolioApp, path: [root, opCoNode, buNode, lobNode] };
    }

    /**
     * Returns the cache key for a given scope.
     * @param userEmail
     */
    private static cacheKey(userEmail?: string): string {
        return userEmail ? userEmail.toLowerCase() : '__all__';
    }

    /**
     * Builds the top-level dashboard portfolio tree from the source's own
     * structured hierarchy (PlanView): root -> Operating Company (OpCo)
     * -> Business Unit -> LOB -> application cards. No business taxonomy is
     * hard-coded; the grouping keys come straight from the ingested `opCo` and
     * `businessDeliveryPortfolio` fields.
     * @param {object[]} applications - applications to organize into the hierarchy
     * @param {string} [userEmail] - optional email used to label the scoped root owner
     * @param {string[]} [opCoAllowlist] - lowercased OpCo allowlist; empty = all OpCos
     * @returns {object} root portfolio node
     */
    private static buildPortfolio(
        applications: StoredApplication[],
        userEmail?: string,
        opCoAllowlist: string[] = []
    ): PortfolioNode {
        // OpCo allowlist (PORTFOLIO_OPCO_ALLOWLIST) scopes the tree to specific operating companies
        // (e.g. "Mercer" for now). Empty allowlist = all OpCos. Configurable via config (redeploy to change).
        const scoped = opCoAllowlist.length
            ? applications.filter((application) =>
                  opCoAllowlist.includes(PortfolioBuilderUtility.opCoOf(application).toLowerCase())
              )
            : applications;

        const opCoMap = PortfolioBuilderUtility.groupApplications(scoped, (application) =>
            PortfolioBuilderUtility.opCoOf(application)
        );

        const children = [...opCoMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([opCo, opCoApps]) => MongoPortfolioRepository.buildOpCoNode(opCo, opCoApps));

        return {
            id: 'application-portfolio',
            name: 'Application Portfolio',
            role: 'Portfolio',
            owner: userEmail || 'All Applications',
            children,
            rollup: MongoPortfolioRepository.computeRollup(scoped),
            apps: [],
        };
    }

    /**
     * Resolves the operating company (OpCo) for an application, straight from the
     * ingested PlanView field.
     * @param {object} application - stored application document
     * @returns {string} operating company name
     */
    /**
     * Builds an operating-company node and its business-unit children.
     * @param {string} opCo - operating company name
     * @param {object[]} opCoApps - applications in the operating company
     * @returns {object} operating-company node
     */
    private static buildOpCoNode(opCo: string, opCoApps: StoredApplication[]): PortfolioNode {
        const businessUnitMap = PortfolioBuilderUtility.groupApplications(opCoApps, (application) =>
            PortfolioBuilderUtility.businessUnitOf(application)
        );

        const children = [...businessUnitMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([businessUnit, businessUnitApps]) =>
                MongoPortfolioRepository.buildBusinessUnitNode(opCo, businessUnit, businessUnitApps)
            );

        return {
            id: `opco-${PortfolioBuilderUtility.slugify(opCo)}`,
            name: opCo,
            role: 'Operating Company',
            owner: PortfolioBuilderUtility.mostCommon(
                opCoApps,
                (application) => application.portfolioOwnerName,
                opCo
            ),
            children,
            rollup: MongoPortfolioRepository.computeRollup(opCoApps),
            apps: [],
        };
    }

    /**
     * Builds a business-unit node and its LOB children.
     * @param {string} opCo - owning operating company
     * @param {string} businessUnit - business-unit label
     * @param {object[]} businessUnitApps - applications in the business unit
     * @returns {object} business-unit node
     */
    private static buildBusinessUnitNode(
        opCo: string,
        businessUnit: string,
        businessUnitApps: StoredApplication[]
    ): PortfolioNode {
        const lobMap = PortfolioBuilderUtility.groupApplications(businessUnitApps, (application) =>
            PortfolioBuilderUtility.lobOf(application)
        );
        const children = [...lobMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([lob, lobApps]) =>
                MongoPortfolioRepository.buildLobNode(opCo, businessUnit, lob, lobApps)
            );

        return {
            id: `business-unit-${PortfolioBuilderUtility.slugify(`${opCo}-${businessUnit}`)}`,
            name: businessUnit,
            role: 'Business Unit',
            owner: PortfolioBuilderUtility.mostCommon(
                businessUnitApps,
                (application) => application.portfolioOwnerName,
                businessUnit
            ),
            children,
            rollup: MongoPortfolioRepository.computeRollup(businessUnitApps),
            apps: [],
        };
    }

    /**
     * Builds a LOB node containing application cards.
     * @param {string} opCo - owning operating company
     * @param {string} businessUnit - owning business-unit label
     * @param {string} lob - LOB label
     * @param {object[]} lobApps - applications belonging to the LOB
     * @returns {object} LOB node
     */
    private static buildLobNode(
        opCo: string,
        businessUnit: string,
        lob: string,
        lobApps: StoredApplication[]
    ): PortfolioNode {
        return {
            id: `lob-${PortfolioBuilderUtility.slugify(`${opCo}-${businessUnit}-${lob}`)}`,
            name: lob,
            role: 'LOB',
            owner: PortfolioBuilderUtility.mostCommon(
                lobApps,
                (application) => application.itOwner,
                lob
            ),
            children: [],
            rollup: MongoPortfolioRepository.computeRollup(lobApps),
            apps: lobApps
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((application) => MongoPortfolioRepository.toPortfolioApp(application)),
        };
    }

    /**
     * Converts a stored application into the dashboard portfolio card shape.
     * @param {object} application - stored application document
     * @returns {object} portfolio card payload
     */
    // eslint-disable-next-line max-lines-per-function
    private static toPortfolioApp(application: StoredApplication) {
        const { _id: applicationId } = application;
        return {
            id: String(applicationId),
            name: application.name,
            health:
                application.datadogMapped && application.healthStatus
                    ? (application.healthStatus.toLowerCase() as 'green' | 'amber' | 'red')
                    : ('undefined' as const),
            perception: 'undefined' as const,
            uptime: application.uptime30d ?? null,
            errorBudgetRemainingPct: application.errorBudgetRemainingPct ?? null,
            slaTarget: application.slaTarget ?? null,
            datadogMapped: application.datadogMapped ?? false,
            resolutionPath: application.resolutionPath ?? null,
            lastSyncStatus: application.lastSyncStatus ?? null,
            lastSyncAt: application.lastSyncAt ?? null,
            monitors: application.monitors ?? [],
            syntheticChecks: (application.syntheticChecks ?? []).map((check) => ({
                name: check.name,
                type: check.type,
                status: check.status,
                uptime: check.uptime,
            })),
            maturity: PortfolioBuilderUtility.computeMaturity(application),
            burnRate: PortfolioBuilderUtility.computeBurnRate(application),
            users: application.currentUserCount || 0,
            totalInternalUsers: application.internalUserCount || 0,
            totalExternalUsers: application.externalUserCount || 0,
            activeUsers: null,
            incidents: 0,
            lastIncident: '—',
            amsSupport: {
                maintenance: application.amsServiceStatusMaintenance || null,
                applicationEngineering: application.amsServiceStatusApplicationEngineering || null,
                applicationSupport: application.amsServiceStatusApplicationSupport || null,
                databaseServices: application.amsServiceStatusDatabaseServices || null,
                itControls: application.amsServiceStatusItControls || null,
            },
            portfolioOwnerName: application.portfolioOwnerName || null,
            portfolioOwnerEmail: application.portfolioOwnerEmail || null,
            technicalContact: application.technicalContact || null,
            technicalContactEmail: application.technicalContactEmail || null,
            podName: application.podName || null,
            podLead: application.podLead || null,
            podLeadEmail: application.podLeadEmail || null,
            itOwner: application.itOwner || null,
            itOwnerEmail: application.itOwnerEmail || null,
            businessOwner: application.businessOwner || null,
            businessOwnerEmail: application.businessOwnerEmail || null,
        };
    }

    /**
     * 11-1: aggregate risk roll-up over a flat set of stored apps — pure local logic,
     * no fetch. Computed from each node's full descendant set (every metric is a flat
     * count/average over leaf apps, so this equals rolling child aggregates upward).
     * An unmapped app counts against coverage and never inflates the node to a false
     * GREEN ("never a false GREEN", 5-6). Percentages are null for an empty set so an
     * empty node never reads as a fabricated 0%.
     * @param {object[]} applications - descendant applications to aggregate
     * @returns {object} the aggregate roll-up
     */
    private static computeRollup(applications: StoredApplication[]): PortfolioNodeRollup {
        const appCount = applications.length;
        if (appCount === 0) {
            return {
                appCount: 0,
                healthyPct: null,
                coveragePct: null,
                sloPassingPct: null,
                avgMaturity: null,
                fastBurnCount: 0,
            };
        }
        const pct = (n: number) => Math.round((n / appCount) * 1000) / 10;
        const mapped = applications.filter((a) => a.datadogMapped === true);
        const healthy = applications.filter(
            (a) => a.datadogMapped === true && (a.healthStatus || '').toUpperCase() === 'GREEN'
        );
        const sloPassing = applications.filter(
            (a) => a.uptime30d != null && a.slaTarget != null && a.uptime30d >= a.slaTarget
        );
        const maturitySum = applications.reduce(
            (sum, a) => sum + PortfolioBuilderUtility.computeMaturity(a).score,
            0
        );
        const fastBurnCount = applications.filter((a) => {
            const { rate } = PortfolioBuilderUtility.computeBurnRate(a);
            return rate != null && rate >= 1;
        }).length;
        return {
            appCount,
            healthyPct: pct(healthy.length),
            coveragePct: pct(mapped.length),
            sloPassingPct: pct(sloPassing.length),
            avgMaturity: Math.round((maturitySum / appCount) * 10) / 10,
            fastBurnCount,
        };
    }

    /**
     * 11-4: derives the executive digest from a scoped set of stored apps. Pure
     * projection, no fetch. Reuses 11-1's computeRollup as the leadership roll-up (no
     * duplicate aggregation). Stamps a freshness summary so a failed last sync (5-8
     * egress blocker) is surfaced rather than presented as current. Top movers need a
     * prior period that is not yet stored, so v1 honestly degrades to a point-in-time
     * snapshot (priorPeriod=null, empty movers) with a note saying so.
     * @param {object[]} applications - scoped applications
     * @param {string} [userEmail] - present when the digest is owner-scoped
     * @returns {object} the digest summary
     */
    private static buildDigest(
        applications: StoredApplication[],
        userEmail?: string
    ): DigestSummary {
        const rollup: PortfolioRollup = MongoPortfolioRepository.computeRollup(applications);
        const failed = applications.filter((a) => a.lastSyncStatus === 'error');
        const lastSyncAt =
            applications
                .map((a) => a.lastSyncAt || null)
                .filter((value): value is string => Boolean(value))
                .sort()
                .pop() || null;
        const freshnessOk = failed.length === 0;
        return {
            generatedAt: new Date().toISOString(),
            scope: userEmail ? 'mine' : 'all',
            rollup,
            freshness: {
                ok: freshnessOk,
                failedCount: failed.length,
                lastSyncAt,
                note: freshnessOk
                    ? null
                    : `Last sync failed for ${failed.length} app(s) — values may be stale.`,
            },
            priorPeriod: null,
            movers: [],
            newRisks: [],
            note: 'No prior period to compare against yet — point-in-time snapshot.',
        };
    }
}
