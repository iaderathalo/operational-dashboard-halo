import { setTimeout as sleep } from 'node:timers/promises';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Raw PlanView record as returned by the Dremio vwAllApplications_Latest view.
 * Matches the static file's JSON structure.
 */
export interface DremioApplicationRecord {
    DateId?: number;
    DataDate?: string;
    OpCo?: string;
    ProductCode?: string;
    ProductName?: string;
    LongDescription?: string;
    Vendor?: string;
    BusinessName?: string;
    BusinessAndSubBusinessName?: string;
    BusinessOwner?: string;
    ItOwner?: string;
    ItOwnerEmail?: string;
    BusinessDeliveryPortfolioName?: string;
    TechnologyDeliveryOwnershipName?: string;
    ProductType?: string;
    RecordType?: string;
    Status?: string;
    ProductGrouping?: string;
    BusinessCapability?: string;
    IndustryMaturityOverallId?: number;
    IndustryMaturityOverall?: string;
    LatestRemediationDate?: string;
    ProductRoadmapId?: string;
    ProductRoadmap?: string;
    PlannedRoadmapImplementationDate?: string;
    UserAudience?: string;
    InternalUserCount?: number | string;
    ExternalUserCount?: number | string;
    FirstUseDate?: string;
    DrTier?: string;
    BusinessCriticality?: string;
    Hardware?: string;
    Storage?: string;
    Hosting?: string;
    Revenue?: string;
    RevenueType?: string;
    RevenueGroup?: string;
    AggregateInternalLabor?: string;
    AggregateExternalLabor?: string;
    AggregateSoftware?: string;
    InternalID?: string;
    DateEffective?: string;
    LastImport?: string;
    ActualRoadmapCompletionDate?: string;
    TargetApplication?: string;
    Customized?: string;
    ClientServer?: string;
    CICDTool?: string;
    CalculatedHosting?: string;
    DataClassification?: string;
    CA_Application_UUID?: string;
    AMSServiceStatusMaintenance?: string;
    AMSSrvceSttsApplctnEngnrng?: string;
    AMSSrvceSttsApplctnSpprt?: string;
    AMSSrvceSttsDtbseSrvcs?: string;
    AMSServiceStatusITControls?: string;
    CASTKey?: string;
    CICDOnboarded?: string;
    CICDPipeline?: string;
    CICDOnboardDate?: string;
    AMSSMaintAmpl?: string;
    PortfolioOwnerName?: string;
    PortfolioOwnerEmail?: string;
    TechnicalContact?: string;
    TechnicalContactEmail?: string;
    AvmCost?: string;
    SharedCost?: string;
    RTO?: string;
    RPO?: string;
    PODName?: string;
    PODLead?: string;
    SN_Sys_Id?: string;
    SN_Business_Application_name?: string;
    PODLeadEmail?: string;
    AdditionalApplicationContact?: string;
    ARANumber?: string;
    ARADate?: string;
    ServiceNowKey?: string;
    AdditionalApplicationContactEmail?: string;
    OwningOrganization?: string;
}

/** Dremio job states returned by the job status endpoint. */
type DremioJobState =
    | 'PENDING'
    | 'METADATA_RETRIEVAL'
    | 'PLANNING'
    | 'QUEUED'
    | 'ENGINE_START'
    | 'STARTING'
    | 'RUNNING'
    | 'COMPLETED'
    | 'CANCELED'
    | 'FAILED';

interface DremioJobStatus {
    id: string;
    jobState: DremioJobState;
    errorMessage?: string;
    rowCount?: number;
}

interface DremioResultsPage {
    rows: DremioApplicationRecord[];
    rowCount?: number;
}

/** How long to wait between job-status polls (ms). */
const POLL_INTERVAL_MS = 1500;
/** Maximum time to wait for a single query to complete (ms). */
const MAX_POLL_DURATION_MS = 120_000;
/** Results page size. */
const PAGE_SIZE = 500;

/**
 * REST client for the Dremio SQL API. Fetches the PlanView application view
 * using the 3-call REST flow: POST /sql → poll job → page results.
 *
 * Reads config from env (via ConfigService):
 * - DREMIO_BASE_URL
 * - DREMIO_PAT (Bearer token)
 * - DREMIO_VIEW_PATH (fully-qualified view reference)
 */
@Injectable()
export default class DremioPortfolioClient {
    private readonly baseUrl: string;

    private readonly pat: string;

    private readonly viewPath: string;

    /**
     *
     * @param configService
     * @param logger
     */
    constructor(
        private readonly configService: ConfigService,
        private readonly logger: Logger
    ) {
        this.baseUrl = (this.configService.get<string>('DREMIO_BASE_URL') || '').replace(/\/$/, '');
        this.pat = this.configService.get<string>('DREMIO_PAT') || '';
        this.viewPath =
            this.configService.get<string>('DREMIO_VIEW_PATH') ||
            'CAI.ConsolidatedApplicationInventory.dbo.vwAllApplications_Latest';
    }

    /**
     * Fetches all rows from the configured PlanView view.
     * Returns the same record array shape as the static JSON file.
     */
    async fetchAllApplications(): Promise<DremioApplicationRecord[]> {
        if (!this.baseUrl) {
            throw new Error(
                'DREMIO_BASE_URL is not configured. Cannot fetch from Dremio without an explicit URL.'
            );
        }
        if (!this.pat) {
            throw new Error('DREMIO_PAT is not configured. Cannot authenticate to Dremio.');
        }

        const viewRef = this.viewPath
            .split('.')
            .map((segment) => `"${segment}"`)
            .join('.');
        const sql = `SELECT * FROM ${viewRef}`;

        this.logger.info('Dremio: submitting SQL query', { viewPath: this.viewPath });
        const jobId = await this.submitSql(sql);

        this.logger.info('Dremio: waiting for job completion', { jobId });
        await this.waitForJob(jobId);

        this.logger.info('Dremio: paging results', { jobId });
        const rows = await this.pageAllResults(jobId);

        this.logger.info('Dremio: fetch complete', { rowCount: rows.length });
        return rows;
    }

    /**
     * Submits a SQL query and returns the Dremio job ID.
     * @param {string} sql - the SQL statement to execute
     * @returns {Promise<string>} the job identifier
     */
    private async submitSql(sql: string): Promise<string> {
        const resp = await this.post<{ id: string }>('/api/v3/sql', { sql });
        if (!resp.id) {
            throw new Error('Dremio /api/v3/sql did not return a job id');
        }
        return resp.id;
    }

    /**
     * Polls the job endpoint until completion or failure.
     * @param {string} jobId - the Dremio job identifier
     * @returns {Promise<void>}
     */
    private async waitForJob(jobId: string): Promise<void> {
        const deadline = Date.now() + MAX_POLL_DURATION_MS;

        while (Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            const status = await this.get<DremioJobStatus>(`/api/v3/job/${jobId}`);
            const state = status.jobState;

            if (state === 'COMPLETED') return;
            if (state === 'FAILED' || state === 'CANCELED') {
                throw new Error(
                    `Dremio job ${jobId} ended with state ${state}: ${status.errorMessage || 'unknown error'}`
                );
            }

            // eslint-disable-next-line no-await-in-loop
            await sleep(POLL_INTERVAL_MS);
        }

        throw new Error(
            `Dremio job ${jobId} did not complete within ${MAX_POLL_DURATION_MS / 1000}s`
        );
    }

    /**
     * Pages all results for a completed job.
     * @param {string} jobId - the Dremio job identifier
     * @returns {Promise<DremioApplicationRecord[]>} all result rows
     */
    private async pageAllResults(jobId: string): Promise<DremioApplicationRecord[]> {
        const allRows: DremioApplicationRecord[] = [];
        let offset = 0;

        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const page = await this.get<DremioResultsPage>(
                `/api/v3/job/${jobId}/results?offset=${offset}&limit=${PAGE_SIZE}`
            );
            const rows = page.rows || [];
            allRows.push(...rows);

            if (rows.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }

        return allRows;
    }

    /**
     * Performs an authenticated GET request against Dremio.
     * @param {string} path - the request path
     * @returns {Promise<T>} the parsed JSON response
     */
    private async get<T>(path: string): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: this.headers(),
        });

        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`Dremio GET ${path} → ${resp.status}: ${body.slice(0, 300)}`);
        }

        return resp.json() as Promise<T>;
    }

    /**
     * Performs an authenticated POST request against Dremio.
     * @param {string} path - the request path
     * @param {unknown} body - the JSON body
     * @returns {Promise<T>} the parsed JSON response
     */
    private async post<T>(path: string, body: unknown): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const respBody = await resp.text().catch(() => '');
            throw new Error(`Dremio POST ${path} → ${resp.status}: ${respBody.slice(0, 300)}`);
        }

        return resp.json() as Promise<T>;
    }

    /**
     * Returns the common authorization headers for Dremio requests.
     * @returns {Record<string, string>} the headers object
     */
    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.pat}`,
            'Content-Type': 'application/json',
        };
    }
}
