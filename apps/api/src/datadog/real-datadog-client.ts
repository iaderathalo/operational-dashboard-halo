import { setTimeout as sleep } from 'node:timers/promises';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { AxiosError, AxiosResponse, isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ResilientHttpService } from '@operational-dashboard/shared-nestjs-utils';

import { DatadogClient } from './datadog-client';
import InMemoryDatadogSnapshot from './datadog-snapshot';
import {
    DatadogMonitor,
    DatadogSloSummary,
    DatadogSnapshot,
    DatadogSyntheticCheck,
} from './datadog.types';
import { hasKeptTag, isKeptTag, mapWithConcurrency, rateLimitWaitMs } from './datadog.utils';

const DAY_SECONDS = 86400;

/** Monitors page size for GET /api/v1/monitor (page/page_size paging). */
const MONITOR_PAGE_SIZE = 1000;
/** SLO list page size for GET /api/v1/slo (limit/offset paging). */
const SLO_PAGE_SIZE = 1000;
/**
 * Hard cap on pages for either list endpoint — a defensive guard so a server that
 * never shrinks a page (or omits paging metadata) can't spin us forever. 1000 pages
 * at the sizes above is ~1M monitors / SLOs, far beyond any real org.
 */
const MAX_PAGES = 1000;
/** Concurrent in-flight SLO-history requests. Low enough to stay under org limits. */
const SLO_HISTORY_CONCURRENCY = 6;
/** Max 429 retries per individual history request before giving up on that window. */
const MAX_RATE_LIMIT_RETRIES = 5;

/** Synthetic public_ids per POST /synthetics/tests/uptimes — keeps request bodies bounded. */
const SYNTHETIC_UPTIMES_BATCH = 50;

interface RawSlo {
    id: string;
    tags?: string[];
    thresholds?: Array<{ target?: number }>;
}

interface RawSyntheticTest {
    public_id?: string;
    name?: string;
    type?: string;
    status?: string;
    tags?: string[];
}

/** One item of the POST /synthetics/tests/uptimes response array (validated live). */
interface RawUptime {
    public_id?: string;
    overall?: { uptime?: number; errors?: unknown[] | null };
}

/**
 * Real Datadog client. Performs ONE bulk fetch per sync run (loadSnapshot): all
 * monitors and all relevant SLOs over a handful of paginated calls on the shared
 * ResilientHttpService. Base URL and DD-API-KEY / DD-APPLICATION-KEY headers are
 * configured in DatadogModule.
 *
 * Why bulk: the previous per-app model issued ~1 monitor + 1 SLO list + 3 history
 * calls PER application (thousands of calls/run), which tripped Datadog's 429 rate
 * limits. loadSnapshot collapses that to (monitor pages) + (SLO pages) + (3 history
 * calls per KEPT SLO), independent of the number of applications.
 *
 * NOTE: the SLO + history parsing follows the documented Datadog shapes but has NOT
 * been validated against a live response yet (no credentials available). Validate it
 * once real keys arrive; until then MockDatadogClient drives the PoC.
 */
@Injectable()
export default class RealDatadogClient implements DatadogClient {
    /**
     * Creates a RealDatadogClient.
     * @param http
     * @param logger
     */
    constructor(
        private readonly http: ResilientHttpService,
        private readonly logger: Logger
    ) {}

    /**
     * Bulk-fetch everything Datadog has and return an immutable, locally-queryable
     * snapshot. Sequence: (1) page all monitors and index them by tag; (2) page all
     * SLOs, keep only app_short_key/app_service_id-tagged ones; (3) resolve each kept
     * SLO's 24h/7d/30d history under bounded concurrency with 429 backoff; (4) index
     * the resulting summaries by the same kept tags.
     * @returns {Promise<DatadogSnapshot>} the snapshot for this sync run
     */
    async loadSnapshot(): Promise<DatadogSnapshot> {
        const monitors = await this.fetchAllMonitors();
        const monitorsByTag = InMemoryDatadogSnapshot.indexMonitors(monitors);

        const keptSlos = await this.fetchKeptSlos();
        const sloByTag = await this.buildSloIndex(keptSlos);

        const syntheticsByTag = await this.fetchSyntheticsIndex();

        this.logger.info('Datadog snapshot loaded', {
            monitors: monitors.length,
            monitorTagBuckets: monitorsByTag.size,
            keptSlos: keptSlos.length,
            sloTagBuckets: sloByTag.size,
            syntheticTagBuckets: syntheticsByTag.size,
        });

        return new InMemoryDatadogSnapshot(monitorsByTag, sloByTag, syntheticsByTag);
    }

    /**
     * Fetches all Synthetic tests (GET /api/v1/synthetics/tests), keeps only those tagged
     * app_short_key:/app_service_id: (the only ones an Application can resolve to), and
     * indexes each kept test under each of its kept tags so either identifier resolves
     * it. Mirrors fetchKeptSlos + buildSloIndex. The v1 list endpoint returns every test
     * in one response, so there is no paging here. A 2xx whose body has a non-array
     * `tests` is a hard error — coercing it to [] would silently drop all checks.
     * @returns {Promise<Map<string, DatadogSyntheticCheck[]>>} the `${tagKey}:${tagValue}` -> checks index
     */
    private async fetchSyntheticsIndex(): Promise<Map<string, DatadogSyntheticCheck[]>> {
        const resp = await this.getWithRateLimitRetry<{ tests?: RawSyntheticTest[] }>(
            '/api/v1/synthetics/tests',
            {}
        );
        const tests = resp.data?.tests;
        if (!Array.isArray(tests)) {
            throw new Error('Datadog /api/v1/synthetics/tests returned a non-array tests body');
        }

        const keptTests = tests.filter((t) => t?.public_id && hasKeptTag(t.tags));
        const uptimes = await this.fetchUptimes(keptTests.map((t) => t.public_id as string));
        const kept = keptTests.map((t) => ({
            check: {
                publicId: t.public_id as string,
                name: t.name ?? '',
                type: t.type ?? '',
                status: t.status ?? '',
                uptime: uptimes.get(t.public_id as string) ?? null,
            },
            tags: t.tags ?? [],
        }));

        const index = new Map<string, DatadogSyntheticCheck[]>();
        kept.forEach(({ check, tags }) => {
            const seen = new Set<string>();
            tags.filter((tag) => isKeptTag(tag)).forEach((tag) => {
                const key = tag.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                const bucket = index.get(key);
                if (bucket) bucket.push(check);
                else index.set(key, [check]);
            });
        });
        return index;
    }

    /**
     * Resolves 30-day uptime for every kept Synthetic test via batched POSTs to
     * /synthetics/tests/uptimes (validated shape: a JSON array of
     * `{ public_id, overall: { uptime, errors } }`). Batches run under the same bounded
     * concurrency as SLO history. A test whose window has no data (overall.errors set —
     * e.g. ALL_NO_DATA, common for paused tests) maps to null, never a misleading 0%.
     * @param {string[]} publicIds - the kept tests' public ids
     * @returns {Promise<Map<string, number | null>>} publicId -> 30d uptime % (or null)
     */
    private async fetchUptimes(publicIds: string[]): Promise<Map<string, number | null>> {
        const out = new Map<string, number | null>();
        if (publicIds.length === 0) return out;

        const batches: string[][] = [];
        for (let i = 0; i < publicIds.length; i += SYNTHETIC_UPTIMES_BATCH) {
            batches.push(publicIds.slice(i, i + SYNTHETIC_UPTIMES_BATCH));
        }

        const now = Math.floor(Date.now() / 1000);
        const batchMaps = await mapWithConcurrency(batches, SLO_HISTORY_CONCURRENCY, (ids) =>
            this.fetchUptimeBatch(ids, now)
        );
        batchMaps.forEach((batchMap) => batchMap.forEach((value, key) => out.set(key, value)));
        return out;
    }

    /**
     * Fetches uptime for one batch of public ids. A failed batch yields an empty map (its
     * checks fall back to null uptime) rather than sinking the whole run.
     * @param {string[]} ids - up to SYNTHETIC_UPTIMES_BATCH public ids
     * @param {number} now - window end (epoch seconds)
     * @returns {Promise<Map<string, number | null>>} publicId -> 30d uptime % (or null)
     */
    private async fetchUptimeBatch(
        ids: string[],
        now: number
    ): Promise<Map<string, number | null>> {
        const map = new Map<string, number | null>();
        try {
            const resp = await this.postWithRateLimitRetry<RawUptime[]>(
                '/api/v1/synthetics/tests/uptimes',
                { from_ts: now - 30 * DAY_SECONDS, to_ts: now, public_ids: ids }
            );
            const data = Array.isArray(resp.data) ? resp.data : [];
            data.forEach((item) => {
                if (!item?.public_id) return;
                const errors = item.overall?.errors;
                const errored = Array.isArray(errors) && errors.length > 0;
                const value = item.overall?.uptime;
                map.set(item.public_id, !errored && typeof value === 'number' ? value : null);
            });
        } catch (error) {
            this.logger.info('Synthetic uptimes unavailable for a batch', { error });
        }
        return map;
    }

    /**
     * Pages GET /api/v1/monitor (page=0,1,2,... with a fixed page_size) until a page
     * comes back smaller than page_size (the last page) or empty. A 2xx whose body is
     * not an array is a hard error — silently coercing it to [] would read as a
     * fleet-wide healthy "No Data".
     * @returns {Promise<DatadogMonitor[]>} every monitor in the org
     */
    private async fetchAllMonitors(): Promise<DatadogMonitor[]> {
        const all: DatadogMonitor[] = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await this.getWithRateLimitRetry<DatadogMonitor[]>('/api/v1/monitor', {
                page,
                page_size: MONITOR_PAGE_SIZE,
                // Attach currently-active maintenance windows (#3) so the rollup can
                // suppress a monitor's Alert instead of painting a false RED.
                with_downtimes: true,
            });
            const body = resp.data;
            if (!Array.isArray(body)) {
                throw new Error(
                    `Datadog /api/v1/monitor returned a non-array body on page [${page}]`
                );
            }
            all.push(...body);
            if (body.length < MONITOR_PAGE_SIZE) {
                return all; // short (or empty) page => last page reached
            }
        }
        this.logger.warn(
            `Datadog /api/v1/monitor hit the ${MAX_PAGES}-page safety cap; results may be truncated`
        );
        return all;
    }

    /**
     * Pages GET /api/v1/slo (limit/offset) until exhausted, keeping only SLOs whose
     * tags include an app_short_key: or app_service_id: tag (the only ones any
     * Application can resolve to). Termination: a page shorter than the limit, or
     * reaching metadata.pagination.total_count when present.
     * @returns {Promise<RawSlo[]>} the kept SLOs (id + tags + thresholds)
     */
    private async fetchKeptSlos(): Promise<RawSlo[]> {
        const kept: RawSlo[] = [];
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const offset = page * SLO_PAGE_SIZE;
            // eslint-disable-next-line no-await-in-loop
            const resp = await this.getWithRateLimitRetry<{
                data?: RawSlo[];
                metadata?: { pagination?: { total_count?: number } };
            }>('/api/v1/slo', { limit: SLO_PAGE_SIZE, offset });

            const data = resp.data?.data;
            if (!Array.isArray(data)) {
                throw new Error(
                    `Datadog /api/v1/slo returned a non-array data on offset [${offset}]`
                );
            }

            data.filter((slo) => slo?.id && hasKeptTag(slo.tags)).forEach((slo) => kept.push(slo));

            const totalCount = resp.data?.metadata?.pagination?.total_count;
            const reachedTotal =
                typeof totalCount === 'number' && offset + data.length >= totalCount;
            if (data.length < SLO_PAGE_SIZE || reachedTotal) {
                return kept; // short page, or we've seen total_count rows => done
            }
        }
        this.logger.warn(
            `Datadog /api/v1/slo hit the ${MAX_PAGES}-page safety cap; results may be truncated`
        );
        return kept;
    }

    /**
     * Resolves 24h/7d/30d history for every kept SLO under bounded concurrency and
     * builds the `${tagKey}:${tagValue}` -> summary index. A single SLO is indexed
     * under each of its kept tags so either identifier (app_short_key or
     * app_service_id) resolves to it.
     * @param {RawSlo[]} keptSlos - SLOs retained by fetchKeptSlos
     * @returns {Promise<Map<string, DatadogSloSummary>>} the SLO summary index
     */
    private async buildSloIndex(keptSlos: RawSlo[]): Promise<Map<string, DatadogSloSummary>> {
        const summaries = await mapWithConcurrency(keptSlos, SLO_HISTORY_CONCURRENCY, (slo) =>
            this.summariseSlo(slo)
        );

        const index = new Map<string, DatadogSloSummary>();
        keptSlos.forEach((slo, i) => {
            const summary = summaries[i];
            (slo.tags ?? [])
                .filter((tag) => isKeptTag(tag))
                .forEach((tag) => {
                    const key = tag.toLowerCase();
                    if (!index.has(key)) index.set(key, summary);
                });
        });
        return index;
    }

    /**
     * Builds a DatadogSloSummary for one SLO by fetching its three history windows.
     * @param {RawSlo} slo - a kept SLO
     * @returns {Promise<DatadogSloSummary>} the aggregated summary
     */
    private async summariseSlo(slo: RawSlo): Promise<DatadogSloSummary> {
        const target = slo.thresholds?.[0]?.target ?? null;
        const now = Math.floor(Date.now() / 1000);
        const [uptime24h, uptime7d, uptime30d] = await Promise.all([
            this.sliForWindow(slo.id, now - DAY_SECONDS, now),
            this.sliForWindow(slo.id, now - 7 * DAY_SECONDS, now),
            this.sliForWindow(slo.id, now - 30 * DAY_SECONDS, now),
        ]);

        // Guard target >= 100 (would divide by zero -> Infinity -> misleading "100%").
        const errorBudgetRemainingPct =
            target != null && target < 100 && uptime30d != null
                ? Math.max(0, Math.min(100, ((uptime30d - target) / (100 - target)) * 100))
                : null;

        return { sloId: slo.id, target, errorBudgetRemainingPct, uptime24h, uptime7d, uptime30d };
    }

    /**
     * Fetches the SLI for one SLO over one time window. A missing/unavailable history
     * is a non-fatal null (logged), not an error — one bad window must not sink the run.
     * @param {string} sloId - the SLO id
     * @param {number} fromTs - window start (epoch seconds)
     * @param {number} toTs - window end (epoch seconds)
     * @returns {Promise<number | null>} the SLI value, or null when unavailable
     */
    private async sliForWindow(
        sloId: string,
        fromTs: number,
        toTs: number
    ): Promise<number | null> {
        try {
            const resp = await this.getWithRateLimitRetry<{
                data?: { overall?: { sli_value?: number } };
            }>(`/api/v1/slo/${sloId}/history`, { from_ts: fromTs, to_ts: toTs });
            const sli = resp.data?.data?.overall?.sli_value;
            return typeof sli === 'number' ? sli : null;
        } catch (error) {
            this.logger.info(`SLO history unavailable for [${sloId}]`, { error });
            return null;
        }
    }

    /**
     * GET wrapper that adds explicit 429 (Too Many Requests) handling on top of the
     * shared ResilientHttpService (whose default retry set does NOT include 429). On a
     * 429 it waits for the server-advertised window — Retry-After (seconds) or
     * x-ratelimit-reset (seconds until reset) — falling back to capped exponential
     * backoff, then retries up to MAX_RATE_LIMIT_RETRIES. Any non-429 error propagates.
     * @param {string} url - request path
     * @param {Record<string, unknown>} params - query params
     * @returns {Promise<AxiosResponse<T>>} the successful response
     */
    private async getWithRateLimitRetry<T>(
        url: string,
        params: Record<string, unknown>
    ): Promise<AxiosResponse<T>> {
        return this.withRateLimitRetry(url, () =>
            firstValueFrom(this.http.get<T>(url, { params }))
        );
    }

    /**
     * POST wrapper with the same 429 handling as {@link getWithRateLimitRetry}.
     * @param {string} url - request path
     * @param {unknown} body - JSON request body
     * @returns {Promise<AxiosResponse<T>>} the successful response
     */
    private async postWithRateLimitRetry<T>(url: string, body: unknown): Promise<AxiosResponse<T>> {
        return this.withRateLimitRetry(url, () => firstValueFrom(this.http.post<T>(url, body)));
    }

    /**
     * Issues one request via `send` and adds explicit 429 (Too Many Requests) handling
     * on top of the shared ResilientHttpService (whose default retry set does NOT include
     * 429). On a 429 it waits for the server-advertised window — Retry-After (seconds) or
     * x-ratelimit-reset (seconds until reset) — falling back to capped exponential
     * backoff, then retries up to MAX_RATE_LIMIT_RETRIES. Any non-429 error propagates.
     * @param {string} label - request path, for the backoff log line
     * @param {() => Promise<AxiosResponse<T>>} send - issues a single attempt
     * @returns {Promise<AxiosResponse<T>>} the successful response
     */
    private async withRateLimitRetry<T>(
        label: string,
        send: () => Promise<AxiosResponse<T>>
    ): Promise<AxiosResponse<T>> {
        for (let attempt = 0; ; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                return await send();
            } catch (error) {
                const status = isAxiosError(error) ? error.response?.status : undefined;
                if (status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
                    throw error;
                }
                const waitMs = rateLimitWaitMs(error as AxiosError, attempt);
                this.logger.warn(
                    `Datadog 429 on [${label}]; backing off ${waitMs}ms ` +
                        `(retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`
                );
                // eslint-disable-next-line no-await-in-loop
                await sleep(waitMs);
            }
        }
    }
}
