import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
    RecommendationResult,
    RecSignal,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import {
    RECOMMENDATION_LLM_CLIENT,
    RecommendationFacts,
    RecommendationLlmClient,
} from './recommendation-llm-client';
import { repairRecommendation, validateRecommendation } from './recommendation-validator';
import { PortfolioApp } from '../dashboard/portfolio.model';
import { PortfolioRepository } from '../dashboard/portfolio.repository';

/** The maturity-signal vocabulary, in canonical order. */
const SIGNAL_ORDER: RecSignal[] = ['mapped', 'hasMonitor', 'hasSLO', 'sloPassing', 'hasOwner'];

/**
 * Canonical rank of a maturity signal; unknown signals sort last.
 * @param signal
 */
const signalRank = (signal: RecSignal): number => {
    const index = SIGNAL_ORDER.indexOf(signal);
    return index === -1 ? SIGNAL_ORDER.length : index;
};

/**
 * Derives the failing signals from the app's maturity payload (the SoT), preserving
 * canonical order. Any signal key not in the canonical list maps to `other`.
 * @param {PortfolioApp} app - the stored portfolio app
 * @returns {RecSignal[]} the failing signals, in canonical order
 */
const failingSignalsOf = (app: PortfolioApp): RecSignal[] => {
    const signals = app.maturity?.signals ?? {};
    return Object.entries(signals)
        .filter(([, passing]) => !passing)
        .map(([key]) => (SIGNAL_ORDER.includes(key as RecSignal) ? (key as RecSignal) : 'other'))
        .sort((a, b) => signalRank(a) - signalRank(b));
};

/** Matches a trailing `_<APPKEY>` token in a monitor / synthetic name. */
const APP_KEY_PATTERN = /_([A-Z0-9]{3,})$/;

/**
 * Derives the app's short key from a linked monitor/synthetic name's trailing
 * `_<APPKEY>` segment. Returns null when nothing matches — never fabricated.
 * @param {PortfolioApp} app - the stored portfolio app
 * @returns {string | null} the derived short key, or null
 */
const deriveShortKey = (app: PortfolioApp): string | null => {
    const names = [
        ...(app.monitors ?? []).map((monitor) => monitor.name),
        ...(app.syntheticChecks ?? []).map((check) => check.name),
    ];
    const matched = names
        .map((name) => name.match(APP_KEY_PATTERN))
        .find((match) => match !== null);
    return matched ? matched[1] : null;
};

/**
 * Pure mapper from the stored portfolio app to the grounded facts the model reasons
 * over. Reads ONLY already-synced fields — never recomputes maturity, never fetches.
 * @param {PortfolioApp} app - the stored portfolio app (richer API-side shape)
 * @returns {RecommendationFacts} the grounded inputs
 */
export const buildFacts = (app: PortfolioApp): RecommendationFacts => ({
    appId: app.id,
    appName: app.name,
    basedOnSyncAt: app.lastSyncAt ?? null,
    lastSyncStatus: app.lastSyncStatus ?? null,
    currentScore: app.maturity?.score ?? 0,
    signals: app.maturity?.signals ?? {},
    failingSignals: failingSignalsOf(app),
    monitorNames: (app.monitors ?? []).map((monitor) => monitor.name),
    syntheticChecks: (app.syntheticChecks ?? []).map((check) => ({
        name: check.name,
        uptime: check.uptime,
    })),
    uptime: app.uptime ?? null,
    slaTarget: app.slaTarget ?? null,
    burnRate: app.burnRate ? { rate: app.burnRate.rate, band: app.burnRate.band } : null,
    errorBudgetRemainingPct: app.errorBudgetRemainingPct ?? null,
    owners: {
        itOwner: app.itOwner ?? null,
        portfolioOwnerName: app.portfolioOwnerName ?? null,
        businessOwner: app.businessOwner ?? null,
    },
    resolutionPath: app.resolutionPath ?? null,
    appShortKey: deriveShortKey(app),
});

interface CacheEntry {
    result: RecommendationResult;
    basedOnSyncAt: string | null;
}

@Injectable()
export default class RecommendationsService {
    /** Per-app cache; auto-invalidated when a newer sync lands (basedOnSyncAt differs). */
    private readonly cache = new Map<string, CacheEntry>();

    /**
     * Creates the recommendations service.
     * @param {object} portfolioRepository - repository for scoped portfolio reads
     * @param {object} client - the provider-agnostic recommendation client
     */
    constructor(
        @Inject('PortfolioRepository')
        private readonly portfolioRepository: PortfolioRepository,
        @Inject(RECOMMENDATION_LLM_CLIENT)
        private readonly client: RecommendationLlmClient
    ) {}

    /**
     * Returns grounded maturity-remediation recommendations for an application.
     * Reuses the portfolio scope semantics (unknown / out-of-scope ids resolve to a
     * 404) and never triggers a new Datadog call. Cached per-app and auto-invalidated
     * when a newer sync lands; `refresh` force-busts.
     * @param {string} appId - portfolio application id
     * @param {string} [scopedEmail] - email used to scope to owned apps, or undefined
     * @param {boolean} [refresh] - true to bypass the cache
     * @returns {Promise<RecommendationResult>} the grounded recommendation payload
     */
    async getRecommendations(
        appId: string,
        scopedEmail?: string,
        refresh = false
    ): Promise<RecommendationResult> {
        const context = await this.portfolioRepository.getAppContext(appId, scopedEmail);

        if (!context) {
            throw new NotFoundException(`Dashboard application [${appId}] not found`);
        }

        const { app } = context;
        const facts = buildFacts(app);

        const cached = this.cache.get(appId);
        if (cached && cached.basedOnSyncAt === facts.basedOnSyncAt && !refresh) {
            return cached.result;
        }

        const raw = await this.client.generate(facts);
        const result = RecommendationsService.ensureGrounded(raw, facts);

        this.cache.set(appId, { result, basedOnSyncAt: facts.basedOnSyncAt });
        return result;
    }

    /**
     * Validates, repairs once, then re-validates a raw payload. Throws when a payload
     * still fails after repair — holds the real provider to the mock's grounding bar.
     * @param {RecommendationResult} raw - the client output
     * @param {RecommendationFacts} facts - the grounded inputs
     * @returns {RecommendationResult} a validated, grounded payload
     */
    private static ensureGrounded(
        raw: RecommendationResult,
        facts: RecommendationFacts
    ): RecommendationResult {
        const violations = validateRecommendation(raw, facts);
        if (violations.length === 0) {
            return raw;
        }

        const repaired = repairRecommendation(raw, facts);
        const repairedViolations = validateRecommendation(repaired, facts);
        if (repairedViolations.length === 0) {
            return repaired;
        }

        throw new Error(
            `Ungrounded recommendation payload could not be repaired: ${repairedViolations.join('; ')}`
        );
    }
}
