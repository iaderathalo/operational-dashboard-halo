import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DashboardDetailResponse } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { PortfolioAppContext, PortfolioNode } from '../portfolio.model';
import { PortfolioRepository } from '../portfolio.repository';
import { StoredApplication } from './mongo-portfolio.types';
import createDashboardDetailResponse from '../seed/detail.seed';

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

@Injectable()
export default class MongoPortfolioRepository
    extends MongoRepository
    implements PortfolioRepository
{
    applicationsCollectionName = 'applications';

    /** Operating-company allowlist (lowercased) from PORTFOLIO_OPCO_ALLOWLIST; empty = all OpCos. */
    private readonly opCoAllowlist: string[];

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
        const applications = await this.getApplications(userEmail);

        return MongoPortfolioRepository.buildPortfolio(applications, userEmail, this.opCoAllowlist);
    }

    /**
     * Returns the detail context for a single application from the stored portfolio.
     * @param {string} appId - portfolio application id
     * @param {string} [userEmail] - optional email used to scope the portfolio to owned applications
     * @returns {Promise<object | null>} application context when found
     */
    async getAppContext(appId: string, userEmail?: string): Promise<PortfolioAppContext | null> {
        const portfolio = await this.getPortfolio(userEmail);

        return findAppContext(appId, portfolio);
    }

    /**
     * Returns the stored detail payload for a single application.
     * Missing detail documents are generated once and persisted.
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
     * Ensures the dashboard portfolio collection exists and has seed data.
     * @returns {Promise<void>}
     */
    async initDb() {
        this.logger.info('Mongo portfolio repository initialized for real application data');
    }

    /**
     * Loads applications from MongoDB, optionally scoped to a specific user.
     * @param {string} [userEmail] - optional email used to filter owned applications
     * @returns {Promise<object[]>} stored applications matching the query
     */
    private async getApplications(userEmail?: string): Promise<StoredApplication[]> {
        const query: Record<string, unknown> = {};

        if (userEmail) {
            query.$or = [
                { itOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
                { portfolioOwnerEmail: { $regex: `^${userEmail}$`, $options: 'i' } },
            ];
        }

        return (await this.getCollection<StoredApplication>(this.applicationsCollectionName))
            .find(query)
            .toArray();
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
                  opCoAllowlist.includes(MongoPortfolioRepository.opCoOf(application).toLowerCase())
              )
            : applications;

        const opCoMap = MongoPortfolioRepository.groupApplications(scoped, (application) =>
            MongoPortfolioRepository.opCoOf(application)
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
            apps: [],
        };
    }

    /**
     * Resolves the operating company (OpCo) for an application, straight from the
     * ingested PlanView field.
     * @param {object} application - stored application document
     * @returns {string} operating company name
     */
    private static opCoOf(application: StoredApplication): string {
        return (application.opCo || 'Unassigned').trim() || 'Unassigned';
    }

    /**
     * Resolves the business unit (line) for an application: the part of the
     * delivery-portfolio name before " - ".
     * @param {object} application - stored application document
     * @returns {string} business-unit label
     */
    private static businessUnitOf(application: StoredApplication): string {
        const p = (
            application.businessDeliveryPortfolio ||
            application.businessUnit ||
            'Unassigned'
        ).trim();
        const i = p.indexOf(' - ');
        return (i === -1 ? p : p.slice(0, i).trim()) || 'Unassigned';
    }

    /**
     * Resolves the LOB for an application (part after " - "), or "General".
     * @param {object} application - stored application document
     * @returns {string} LOB label
     */
    private static lobOf(application: StoredApplication): string {
        const p = (
            application.businessDeliveryPortfolio ||
            application.businessUnit ||
            'Unassigned'
        ).trim();
        const i = p.indexOf(' - ');
        return i === -1 ? 'General' : p.slice(i + 3).trim();
    }

    /**
     * Returns the most common non-empty value produced by the selector, or the fallback.
     * @param {object[]} applications - applications in the group
     * @param {Function} selector - derives a candidate label from an application
     * @param {string} fallback - value used when no candidate is present
     * @returns {string} most frequent label or the fallback
     */
    private static mostCommon(
        applications: StoredApplication[],
        selector: (application: StoredApplication) => string | null | undefined,
        fallback: string
    ): string {
        const counts = applications.reduce((map, app) => {
            const v = (selector(app) || '').trim();
            if (v) map.set(v, (map.get(v) || 0) + 1);
            return map;
        }, new Map<string, number>());
        let best = fallback;
        let bestCount = 0;
        counts.forEach((n, v) => {
            if (n > bestCount) {
                best = v;
                bestCount = n;
            }
        });
        return best;
    }

    /**
     * Groups applications by a derived key.
     * @param {object[]} applications - applications to group
     * @param {Function} keySelector - function used to derive the grouping key
     * @returns {Map<string, object[]>} applications grouped by the selected key
     */
    private static groupApplications(
        applications: StoredApplication[],
        keySelector: (application: StoredApplication) => string
    ): Map<string, StoredApplication[]> {
        return applications.reduce((map, app) => {
            const key = keySelector(app);
            const bucket = map.get(key) || [];
            bucket.push(app);
            map.set(key, bucket);
            return map;
        }, new Map<string, StoredApplication[]>());
    }

    /**
     * Builds an operating-company node and its business-unit children.
     * @param {string} opCo - operating company name
     * @param {object[]} opCoApps - applications in the operating company
     * @returns {object} operating-company node
     */
    private static buildOpCoNode(opCo: string, opCoApps: StoredApplication[]): PortfolioNode {
        const businessUnitMap = MongoPortfolioRepository.groupApplications(
            opCoApps,
            (application) => MongoPortfolioRepository.businessUnitOf(application)
        );

        const children = [...businessUnitMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([businessUnit, businessUnitApps]) =>
                MongoPortfolioRepository.buildBusinessUnitNode(opCo, businessUnit, businessUnitApps)
            );

        return {
            id: `opco-${MongoPortfolioRepository.slugify(opCo)}`,
            name: opCo,
            role: 'Operating Company',
            owner: MongoPortfolioRepository.mostCommon(
                opCoApps,
                (application) => application.portfolioOwnerName,
                opCo
            ),
            children,
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
        const lobMap = MongoPortfolioRepository.groupApplications(businessUnitApps, (application) =>
            MongoPortfolioRepository.lobOf(application)
        );

        const children = [...lobMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([lob, lobApps]) =>
                MongoPortfolioRepository.buildLobNode(opCo, businessUnit, lob, lobApps)
            );

        return {
            id: `business-unit-${MongoPortfolioRepository.slugify(`${opCo}-${businessUnit}`)}`,
            name: businessUnit,
            role: 'Business Unit',
            owner: MongoPortfolioRepository.mostCommon(
                businessUnitApps,
                (application) => application.portfolioOwnerName,
                businessUnit
            ),
            children,
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
            id: `lob-${MongoPortfolioRepository.slugify(`${opCo}-${businessUnit}-${lob}`)}`,
            name: lob,
            role: 'LOB',
            owner: MongoPortfolioRepository.mostCommon(
                lobApps,
                (application) => application.itOwner,
                lob
            ),
            children: [],
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
            maturity: MongoPortfolioRepository.computeMaturity(application),
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
     * Derives a per-app observability maturity scorecard from data the sync already brings —
     * no new Datadog call. Signals: mapped, has-monitor, has-SLO, SLO-passing, has-owner.
     * @param {object} application - stored application document
     * @returns {{score: number, max: number, signals: Record<string, boolean>}} maturity payload
     */
    private static computeMaturity(application: StoredApplication) {
        const {
            datadogMapped,
            monitors,
            uptime30d,
            slaTarget,
            itOwner,
            portfolioOwnerName,
            businessOwner,
        } = application;
        const signals = {
            mapped: datadogMapped ?? false,
            hasMonitor: (monitors?.length ?? 0) > 0,
            hasSLO: uptime30d != null,
            sloPassing: uptime30d != null && slaTarget != null && uptime30d >= slaTarget,
            hasOwner: Boolean(itOwner || portfolioOwnerName || businessOwner),
        };
        const score = Object.values(signals).filter(Boolean).length;
        return { score, max: Object.keys(signals).length, signals };
    }

    /**
     * Normalizes a label for safe use in portfolio node ids.
     * @param {string} value - label to normalize
     * @returns {string} slugified label
     */
    private static slugify(value: string): string {
        return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
}
