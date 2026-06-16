import { DatadogSnapshot } from './datadog.types';

/**
 * Telemetry source for the Crawler. Implemented by RealDatadogClient (live HTTP)
 * and MockDatadogClient (offline canned data); DatadogModule selects which by the
 * presence of DATADOG_API_KEY. Consumers depend on this interface only.
 *
 * The client exposes a single BULK entry point: loadSnapshot() fetches everything
 * Datadog has (all monitors + all relevant SLOs) in a handful of paginated calls,
 * once per sync run. The sync service then resolves every Application against the
 * returned {@link DatadogSnapshot} with purely local lookups — no per-app HTTP.
 * This replaces the old one-request-per-app model that tripped Datadog 429 limits.
 */
export interface DatadogClient {
    loadSnapshot(): Promise<DatadogSnapshot>;
}

export const DATADOG_CLIENT = 'DatadogClient';
