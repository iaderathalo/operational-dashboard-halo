/**
 * 12-x: grounded, provider-agnostic Maturity remediation. One action per failing
 * maturity signal, projected toward 5/5. Mirrors {@link MaturityScore}'s signal
 * vocabulary. Every action cites the FACTS field it is grounded on and never
 * invents a metric value that is absent from the synced data.
 */
export type RecSignal = 'mapped' | 'hasMonitor' | 'hasSLO' | 'sloPassing' | 'hasOwner' | 'other';
export type RecEffort = 'low' | 'medium' | 'high';
export type RecConfidence = 'high' | 'medium' | 'low';
export type RecFreshness = 'live' | 'stale';

/** One prioritized, grounded action that raises the maturity score by one signal. */
export interface RecommendationAction {
    /** Stable id, `rec-${signal}`. */
    id: string;
    signal: RecSignal;
    title: string;
    why: string;
    /** 2–4 concrete steps, always non-empty. */
    howTo: string[];
    /** Maturity points the action restores; always 1 in v1. */
    expectedMaturityDelta: number;
    effort: RecEffort;
    owner: string;
    /** Cites the FACTS field(s) verbatim; never carries a value absent from FACTS. */
    evidence: string;
    confidence: RecConfidence;
}

/** The full Recommendations payload for a single application. */
export interface RecommendationResult {
    appId: string;
    /** ISO timestamp set at generation time. */
    generatedAt: string;
    /** The sync the recommendations were grounded on (= app.lastSyncAt). */
    basedOnSyncAt: string | null;
    /** Current maturity score, 0–5 (= maturity.score). */
    currentScore: number;
    /** Always 5 (full maturity). */
    targetScore: number;
    /** `live` when the last sync was ok, otherwise `stale`. */
    freshness: RecFreshness;
    actions: RecommendationAction[];
    /** Grounded "what blocks 5/5" headline. */
    notes: string;
}
