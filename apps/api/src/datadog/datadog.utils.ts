import { AxiosError } from 'axios';

/** Only SLOs / Synthetic tests carrying one of these tag keys are kept (and indexed). */
const KEPT_TAG_KEYS = ['app_short_key', 'app_service_id'];

/** Base for the exponential 429 backoff (ms) when no Retry-After header is present. */
const RATE_LIMIT_BACKOFF_BASE_MS = 1000;
/** Ceiling for any single backoff sleep (ms) so a bogus header can't stall the run. */
const RATE_LIMIT_BACKOFF_MAX_MS = 30000;

/**
 * Splits a `key:value` tag into [key, value], lowercased; value defaults to '' for
 * a valueless tag. Only the first colon splits (values may contain colons).
 * @param {string} tag - a Datadog tag string
 * @returns {[string, string]} the lowercased [key, value]
 */
export function splitTag(tag: string): [string, string] {
    const lower = (tag ?? '').toLowerCase();
    const idx = lower.indexOf(':');
    return idx === -1 ? [lower, ''] : [lower.slice(0, idx), lower.slice(idx + 1)];
}

/**
 * True when a single tag string is one of the kept SLO tag keys
 * (app_short_key:<value> / app_service_id:<value>), matched case-insensitively and
 * requiring a non-empty value after the first colon.
 * @param {string} tag - a Datadog tag string
 * @returns {boolean} whether the tag is a kept identifier tag
 */
export function isKeptTag(tag: string): boolean {
    const [key, value] = splitTag(tag);
    return value !== '' && KEPT_TAG_KEYS.includes(key);
}

/**
 * True when ANY of the SLO's tags is a kept identifier tag.
 * @param {string[] | undefined} tags - the SLO's tags
 * @returns {boolean} whether the SLO should be kept
 */
export function hasKeptTag(tags: string[] | undefined): boolean {
    return Array.isArray(tags) && tags.some((t) => isKeptTag(t));
}

/**
 * Runs `worker` over `items` with at most `limit` promises in flight, preserving
 * input order in the result array. Used to bound concurrent SLO-history calls.
 * @param {T[]} items - inputs to process
 * @param {number} limit - max concurrent workers
 * @param {Function} worker - async mapper
 * @returns {Promise<R[]>} results in the same order as `items`
 */
export async function mapWithConcurrency<T, R>(
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
 * Reads a non-negative numeric header value (case-insensitive), or null when the
 * header is absent or not a finite number.
 * @param {object} headers - the response headers object
 * @param {string} name - lowercase header name
 * @returns {number | null} the parsed value, or null
 */
function numericHeader(headers: unknown, name: string): number | null {
    if (!headers || typeof headers !== 'object') return null;
    // Axios lowercases response header keys, but read defensively.
    const bag = headers as Record<string, unknown>;
    const raw = bag[name] ?? bag[name.toLowerCase()];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
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
export function rateLimitWaitMs(error: AxiosError, attempt: number): number {
    const headers = error.response?.headers ?? {};
    const headerSeconds =
        numericHeader(headers, 'retry-after') ?? numericHeader(headers, 'x-ratelimit-reset');
    const ms =
        headerSeconds != null ? headerSeconds * 1000 : RATE_LIMIT_BACKOFF_BASE_MS * 2 ** attempt;
    return Math.min(RATE_LIMIT_BACKOFF_MAX_MS, Math.max(0, ms));
}
