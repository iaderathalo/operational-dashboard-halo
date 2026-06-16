import { setTimeout as sleep } from 'node:timers/promises';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Injectable } from '@nestjs/common';
import { AxiosError, AxiosResponse, isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ResilientHttpService } from '@operational-dashboard/shared-nestjs-utils';

import { DatadogClient } from './datadog-client';
import InMemoryDatadogSnapshot from './datadog-snapshot';
import { DatadogMonitor, DatadogSloSummary, DatadogSnapshot } from './datadog.types';

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
/** Base for the exponential 429 backoff (ms) when no Retry-After header is present. */
const RATE_LIMIT_BACKOFF_BASE_MS = 1000;
/** Ceiling for any single backoff sleep (ms) so a bogus header can't stall the run. */
const RATE_LIMIT_BACKOFF_MAX_MS = 30000;

/** Only SLOs carrying one of these tag keys are kept (and indexed) in the snapshot. */
const KEPT_SLO_TAG_KEYS = ['app_short_key', 'app_service_id'];

interface RawSlo {
    id: string;
    tags?: string[];
    thresholds?: Array<{ target?: number }>;
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

        this.logger.info('Datadog snapshot loaded', {
            monitors: monitors.length,
            monitorTagBuckets: monitorsByTag.size,
            keptSlos: keptSlos.length,
            sloTagBuckets: sloByTag.size,
        });

        return new InMemoryDatadogSnapshot(monitorsByTag, sloByTag);
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
                throw new Error(`Datadog /api/v1/slo returned a non-array data on offset [${offset}]`);
            }

            for (const slo of data) {
                if (slo?.id && RealDatadogClient.hasKeptTag(slo.tags)) {
                    kept.push(slo);
                }
            }

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
        const summaries = await this.mapWithConcurrency(
            keptSlos,
            SLO_HISTORY_CONCURRENCY,
            (slo) => this.summariseSlo(slo)
        );

        const index = new Map<string, DatadogSloSummary>();
        keptSlos.forEach((slo, i) => {
            const summary = summaries[i];
            for (const tag of slo.tags ?? []) {
                if (!RealDatadogClient.isKeptTag(tag)) continue;
                const key = tag.toLowerCase();
                // First SLO wins a given tag bucket (deterministic; mirrors the old
                // "first SLO" selection of getSloSummaryByServiceTag).
                if (!index.has(key)) index.set(key, summary);
            }
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
    private async sliForWindow(sloId: string, fromTs: number, toTs: number): Promise<number | null> {
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
        for (let attempt = 0; ; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                return await firstValueFrom(this.http.get<T>(url, { params }));
            } catch (error) {
                const status = isAxiosError(error) ? error.response?.status : undefined;
                if (status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES) {
                    throw error;
                }
                const waitMs = RealDatadogClient.rateLimitWaitMs(error as AxiosError, attempt);
                this.logger.warn(
                    `Datadog 429 on [${url}]; backing off ${waitMs}ms ` +
                        `(retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`
                );
                // eslint-disable-next-line no-await-in-loop
                await sleep(waitMs);
            }
        }
    }

    /**
     * Computes how long to wait after a 429. Prefers the server's Retry-After header
     * (delay in seconds), then x-ratelimit-reset (seconds until the limit resets),
     * else capped exponential backoff. The result is always clamped to
     * [0, RATE_LIMIT_BACKOFF_MAX_MS] so a malformed header can't stall the run.
     * @param {AxiosError} error - the 429 error
     * @param {number} attempt - zero-based retry attempt (drives the exponential fallback)
     * @returns {number} milliseconds to sleep before retrying
     */
    private static rateLimitWaitMs(error: AxiosError, attempt: number): number {
        const headers = error.response?.headers ?? {};
        const headerSeconds =
            RealDatadogClient.numericHeader(headers, 'retry-after') ??
            RealDatadogClient.numericHeader(headers, 'x-ratelimit-reset');
        const ms =
            headerSeconds != null
                ? headerSeconds * 1000
                : RATE_LIMIT_BACKOFF_BASE_MS * 2 ** attempt;
        return Math.min(RATE_LIMIT_BACKOFF_MAX_MS, Math.max(0, ms));
    }

    /**
     * Reads a non-negative numeric header value (case-insensitive), or null when the
     * header is absent or not a finite number.
     * @param {unknown} headers - the response headers object
     * @param {string} name - lowercase header name
     * @returns {number | null} the parsed value, or null
     */
    private static numericHeader(headers: unknown, name: string): number | null {
        if (!headers || typeof headers !== 'object') return null;
        // Axios lowercases response header keys, but read defensively.
        const bag = headers as Record<string, unknown>;
        const raw = bag[name] ?? bag[name.toLowerCase()];
        const value = Number(Array.isArray(raw) ? raw[0] : raw);
        return Number.isFinite(value) && value >= 0 ? value : null;
    }

    /**
     * Runs `worker` over `items` with at most `limit` promises in flight, preserving
     * input order in the result array. Used to bound concurrent SLO-history calls.
     * @param {T[]} items - inputs to process
     * @param {number} limit - max concurrent workers
     * @param {(item: T, index: number) => Promise<R>} worker - async mapper
     * @returns {Promise<R[]>} results in the same order as `items`
     */
    private async mapWithConcurrency<T, R>(
        items: T[],
        limit: number,
        worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        const results = new Array<R>(items.length);
        let next = 0;
        const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
            for (;;) {
                const i = next;
                next += 1;
                if (i >= items.length) return;
                // eslint-disable-next-line no-await-in-loop
                results[i] = await worker(items[i], i);
            }
        });
        await Promise.all(runners);
        return results;
    }

    /**
     * True when a single tag string is one of the kept SLO tag keys
     * (app_short_key:<value> / app_service_id:<value>), matched case-insensitively and
     * requiring a non-empty value after the first colon.
     * @param {string} tag - a Datadog tag string
     * @returns {boolean} whether the tag is a kept identifier tag
     */
    private static isKeptTag(tag: string): boolean {
        const [key, value] = RealDatadogClient.splitTag(tag);
        return value !== '' && KEPT_SLO_TAG_KEYS.includes(key);
    }

    /**
     * True when ANY of the SLO's tags is a kept identifier tag.
     * @param {string[] | undefined} tags - the SLO's tags
     * @returns {boolean} whether the SLO should be kept
     */
    private static hasKeptTag(tags: string[] | undefined): boolean {
        return Array.isArray(tags) && tags.some((t) => RealDatadogClient.isKeptTag(t));
    }

    /**
     * Splits a `key:value` tag into [key, value], lowercased; value defaults to '' for
     * a valueless tag. Only the first colon splits (values may contain colons).
     * @param {string} tag - a Datadog tag string
     * @returns {[string, string]} the lowercased [key, value]
     */
    private static splitTag(tag: string): [string, string] {
        const lower = (tag ?? '').toLowerCase();
        const idx = lower.indexOf(':');
        return idx === -1 ? [lower, ''] : [lower.slice(0, idx), lower.slice(idx + 1)];
    }
}
