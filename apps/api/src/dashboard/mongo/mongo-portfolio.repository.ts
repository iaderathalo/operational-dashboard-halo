import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';

import {
    Application,
    DashboardDetailResponse,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoRepository from '../../repository/mongo/mongo-repository';
import { PortfolioAppContext, PortfolioNode } from '../portfolio.model';
import { PortfolioRepository } from '../portfolio.repository';
import createDashboardDetailResponse from '../seed/detail.seed';

type MongoDbId = Record<'_id', ObjectId | string>;
type StoredApplication = Application &
    MongoDbId & {
        itOwnerEmail?: string | null;
        portfolioOwnerEmail?: string | null;
        portfolioOwnerName?: string | null;
        itOwner?: string | null;
        internalUserCount?: number;
        externalUserCount?: number;
        businessOwner?: string | null;
        businessOwnerEmail?: string | null;
        technicalContact?: string | null;
        technicalContactEmail?: string | null;
        podName?: string | null;
        podLead?: string | null;
        podLeadEmail?: string | null;
        amsServiceStatusMaintenance?: string | null;
        amsServiceStatusApplicationEngineering?: string | null;
        amsServiceStatusApplicationSupport?: string | null;
        amsServiceStatusDatabaseServices?: string | null;
        amsServiceStatusItControls?: string | null;
    };

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
     * @param {string} [userEmail] - optional email used to scope the portfolio to owned applications
     * @returns {Promise<object>} dashboard portfolio tree
     */
    async getPortfolio(userEmail?: string): Promise<PortfolioNode> {
        const applications = await this.getApplications(userEmail);

        return MongoPortfolioRepository.buildPortfolio(applications, userEmail);
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
     * Builds the top-level dashboard portfolio tree from stored applications.
     * @param {object[]} applications - applications to organize into the portfolio hierarchy
     * @param {string} [userEmail] - optional email used to label the scoped root owner
     * @returns {object} root portfolio node
     */
    private static buildPortfolio(
        applications: StoredApplication[],
        userEmail?: string
    ): PortfolioNode {
        const portfolioOwnerMap = MongoPortfolioRepository.groupApplications(
            applications,
            (application) => application.portfolioOwnerName || 'Unassigned Portfolio'
        );

        const children = [...portfolioOwnerMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([portfolioOwner, portfolioApps]) =>
                MongoPortfolioRepository.buildPortfolioOwnerNode(portfolioOwner, portfolioApps)
            );

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
     * Groups applications by a derived key.
     * @param {object[]} applications - applications to group
     * @param {Function} keySelector - function used to derive the grouping key
     * @returns {Map<string, object[]>} applications grouped by the selected key
     */
    private static groupApplications(
        applications: StoredApplication[],
        keySelector: (application: StoredApplication) => string
    ): Map<string, StoredApplication[]> {
        const groupedApplications = new Map<string, StoredApplication[]>();

        applications.forEach((application) => {
            const key = keySelector(application);
            const existing = groupedApplications.get(key) || [];
            existing.push(application);
            groupedApplications.set(key, existing);
        });

        return groupedApplications;
    }

    /**
     * Builds a portfolio-owner node and its business-unit children.
     * @param {string} portfolioOwner - portfolio owner label
     * @param {object[]} portfolioApps - applications belonging to the portfolio owner
     * @returns {object} portfolio-owner node
     */
    private static buildPortfolioOwnerNode(
        portfolioOwner: string,
        portfolioApps: StoredApplication[]
    ): PortfolioNode {
        const businessUnitMap = MongoPortfolioRepository.groupApplications(
            portfolioApps,
            (application) => application.businessUnit || 'Unknown'
        );

        const businessUnitChildren = [...businessUnitMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([businessUnit, businessUnitApps]) =>
                MongoPortfolioRepository.buildBusinessUnitNode(
                    portfolioOwner,
                    businessUnit,
                    businessUnitApps
                )
            );

        return {
            id: `portfolio-owner-${MongoPortfolioRepository.slugify(portfolioOwner)}`,
            name: portfolioOwner,
            role: 'Portfolio Owner',
            owner: portfolioOwner,
            children: businessUnitChildren,
            apps: [],
        };
    }

    /**
     * Builds a business-unit node and its project-owner children.
     * @param {string} portfolioOwner - owning portfolio label
     * @param {string} businessUnit - business-unit label
     * @param {object[]} businessUnitApps - applications assigned to the business unit
     * @returns {object} business-unit node
     */
    private static buildBusinessUnitNode(
        portfolioOwner: string,
        businessUnit: string,
        businessUnitApps: StoredApplication[]
    ): PortfolioNode {
        const projectOwnerMap = MongoPortfolioRepository.groupApplications(
            businessUnitApps,
            (application) => application.itOwner || 'Unassigned Project Owner'
        );

        const projectOwnerChildren = [...projectOwnerMap.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([projectOwner, ownedApps]) =>
                MongoPortfolioRepository.buildProjectOwnerNode(
                    portfolioOwner,
                    businessUnit,
                    projectOwner,
                    ownedApps
                )
            );

        return {
            id: `business-unit-${MongoPortfolioRepository.slugify(`${portfolioOwner}-${businessUnit}`)}`,
            name: businessUnit,
            role: 'Business Unit',
            owner: portfolioOwner,
            children: projectOwnerChildren,
            apps: [],
        };
    }

    /**
     * Builds a project-owner node containing application cards.
     * @param {string} portfolioOwner - owning portfolio label
     * @param {string} businessUnit - owning business-unit label
     * @param {string} projectOwner - project-owner label
     * @param {object[]} ownedApps - applications belonging to the project owner
     * @returns {object} project-owner node
     */
    private static buildProjectOwnerNode(
        portfolioOwner: string,
        businessUnit: string,
        projectOwner: string,
        ownedApps: StoredApplication[]
    ): PortfolioNode {
        return {
            id: `project-owner-${MongoPortfolioRepository.slugify(`${portfolioOwner}-${businessUnit}-${projectOwner}`)}`,
            name: projectOwner,
            role: 'Project Owner',
            owner: portfolioOwner,
            children: [],
            apps: ownedApps
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
            health: 'undefined' as const,
            perception: 'undefined' as const,
            uptime: null,
            users: application.currentUserCount || 0,
            totalInternalUsers: application.internalUserCount || 0,
            totalExternalUsers: application.externalUserCount || 0,
            activeUsers: null,
            incidents: 0,
            lastIncident: 'Undefined',
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
