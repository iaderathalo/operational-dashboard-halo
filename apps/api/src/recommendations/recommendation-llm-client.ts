import {
    RecommendationResult,
    RecSignal,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { MaturityScore } from '../dashboard/portfolio.model';

/** Injection token for the provider-agnostic recommendation LLM client. */
export const RECOMMENDATION_LLM_CLIENT = 'RecommendationLlmClient';

/**
 * The grounded input the model reasons over. Built from already-synced app fields
 * only (no new Datadog call). The client must never emit a value that is not
 * present here — this is the anti-hallucination contract.
 */
export interface RecommendationFacts {
    appId: string;
    appName: string;
    /** = app.lastSyncAt — the sync the facts were read from. */
    basedOnSyncAt: string | null;
    lastSyncStatus: 'ok' | 'error' | 'unmapped' | null;
    /** = maturity.score, the single source of truth (never recomputed here). */
    currentScore: number;
    /** The 5 maturity booleans, verbatim. */
    signals: MaturityScore['signals'];
    /** The signals that are currently false, in maturity-signal order. */
    failingSignals: RecSignal[];
    /** app.monitors[].name, verbatim. */
    monitorNames: string[];
    /** app.syntheticChecks mapped to name + 30d uptime (null when paused / no data). */
    syntheticChecks: { name: string; uptime: number | null }[];
    /** app.uptime (= uptime30d). */
    uptime: number | null;
    slaTarget: number | null;
    burnRate: { rate: number | null; band: string } | null;
    errorBudgetRemainingPct: number | null;
    owners: {
        itOwner: string | null;
        portfolioOwnerName: string | null;
        businessOwner: string | null;
    };
    resolutionPath: string | null;
    /** Derived from a linked monitor/synthetic trailing `_<APPKEY>`; null when not derivable. */
    appShortKey: string | null;
}

/**
 * Provider-agnostic recommendation client. A real provider is a single drop-in
 * implementation selected by config — mirrors the Datadog real-vs-mock seam.
 */
export interface RecommendationLlmClient {
    generate(facts: RecommendationFacts): Promise<RecommendationResult>;
}
