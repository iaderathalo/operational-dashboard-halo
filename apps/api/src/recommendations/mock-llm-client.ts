import { Injectable } from '@nestjs/common';

import {
    RecConfidence,
    RecEffort,
    RecFreshness,
    RecommendationAction,
    RecommendationResult,
    RecSignal,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { RecommendationFacts, RecommendationLlmClient } from './recommendation-llm-client';

/** Deterministic per-signal seed: every restored signal is worth +1 maturity. */
const SIGNAL_SEEDS: Record<
    RecSignal,
    { delta: number; effort: RecEffort; confidence: RecConfidence }
> = {
    mapped: { delta: 1, effort: 'low', confidence: 'high' },
    hasMonitor: { delta: 1, effort: 'low', confidence: 'high' },
    hasSLO: { delta: 1, effort: 'medium', confidence: 'high' },
    sloPassing: { delta: 1, effort: 'high', confidence: 'medium' },
    hasOwner: { delta: 1, effort: 'low', confidence: 'high' },
    other: { delta: 1, effort: 'medium', confidence: 'low' },
};

const EFFORT_RANK: Record<RecEffort, number> = { low: 0, medium: 1, high: 2 };
const CONF_RANK: Record<RecConfidence, number> = { high: 0, medium: 1, low: 2 };
const SIGNAL_PRIORITY: Record<RecSignal, number> = {
    mapped: 0,
    hasOwner: 1,
    hasMonitor: 2,
    hasSLO: 3,
    sloPassing: 4,
    other: 5,
};

/**
 * Rounds a raw synthetic uptime to 2dp without inventing precision.
 * @param uptime
 */
const roundUptime = (uptime: number): number => Math.round(uptime * 100) / 100;

/**
 * Renders a 30d-uptime % the way evidence/why strings cite it, grounded on real data.
 * @param uptime
 */
const formatUptime = (uptime: number | null): string =>
    uptime == null ? 'no recorded uptime' : `synthetic uptime ${roundUptime(uptime)}%`;

/**
 * First synthetic with a non-null uptime, used to ground the SLO actions.
 * @param facts
 */
const firstSyntheticWithUptime = (
    facts: RecommendationFacts
): { name: string; uptime: number } | null => {
    const match = facts.syntheticChecks.find((check) => check.uptime != null);
    return match ? { name: match.name, uptime: match.uptime as number } : null;
};

/**
 * Renders a possibly-null measured value as a literal "not available" — never a fake number.
 * @param value
 */
const orNotAvailable = (value: number | null): string =>
    value == null ? 'not available' : String(value);

/**
 * Renders error-budget remaining as a literal "not available" or a grounded percentage.
 * @param value
 */
const errorBudgetText = (value: number | null): string =>
    value == null ? 'not available' : `${value}%`;

/**
 * Owner label: first present owner with its role suffix, else "unassigned".
 * @param facts
 */
const resolveOwner = (facts: RecommendationFacts): string => {
    if (facts.owners.itOwner) {
        return `${facts.owners.itOwner} (IT)`;
    }
    if (facts.owners.portfolioOwnerName) {
        return `${facts.owners.portfolioOwnerName} (Portfolio)`;
    }
    if (facts.owners.businessOwner) {
        return `${facts.owners.businessOwner} (Business)`;
    }
    return 'unassigned';
};

/**
 * The app's short key for how-to interpolation; never fabricated.
 * @param facts
 */
const shortKeyLabel = (facts: RecommendationFacts): string =>
    facts.appShortKey ?? "the app's short key";

/**
 * Builds the !mapped action — grounds on the resolver tag, never a fake key.
 * @param facts
 * @param owner
 */
const buildMappedAction = (facts: RecommendationFacts, owner: string): RecommendationAction => ({
    id: 'rec-mapped',
    signal: 'mapped',
    title: 'Map the app to Datadog',
    why: 'The app is not resolved to any Datadog service, so no monitors, SLOs, or health roll up to it and every downstream maturity signal is blocked.',
    howTo: [
        `Tag the app's Datadog service with app_short_key:${shortKeyLabel(facts)}`,
        'Re-run the portfolio sync and confirm resolutionPath becomes primary',
    ],
    expectedMaturityDelta: SIGNAL_SEEDS.mapped.delta,
    effort: SIGNAL_SEEDS.mapped.effort,
    owner,
    evidence: `mapped=false · resolutionPath=${facts.resolutionPath ?? 'unmapped'}`,
    confidence: SIGNAL_SEEDS.mapped.confidence,
});

/**
 * Builds the !hasMonitor action — references the app generically, never a made-up monitor name.
 * @param facts
 * @param owner
 */
const buildHasMonitorAction = (
    facts: RecommendationFacts,
    owner: string
): RecommendationAction => ({
    id: 'rec-hasMonitor',
    signal: 'hasMonitor',
    title: 'Add a Datadog monitor',
    why: 'No Datadog monitor is linked to the app, so there is no automated alerting on its key endpoint and outages are noticed only by users.',
    howTo: [
        "Create a Datadog monitor on the app's key endpoint / host",
        `Tag it with app_short_key:${shortKeyLabel(facts)} so the sync links it`,
        'Re-run the sync and confirm a monitor is resolved',
    ],
    expectedMaturityDelta: SIGNAL_SEEDS.hasMonitor.delta,
    effort: SIGNAL_SEEDS.hasMonitor.effort,
    owner,
    evidence: 'hasMonitor=false · 0 linked Datadog monitors',
    confidence: SIGNAL_SEEDS.hasMonitor.confidence,
});

/**
 * Builds the !hasSLO action — grounds on the real synthetic name + uptime when present.
 * @param facts
 * @param owner
 */
const buildHasSloAction = (facts: RecommendationFacts, owner: string): RecommendationAction => {
    const synthetic = firstSyntheticWithUptime(facts);
    const why = synthetic
        ? `A 30-day ${formatUptime(synthetic.uptime)} is already being measured but is not formalized into an SLO, so there is no error budget, no burn alerting, and the app cannot prove reliability against a target.`
        : 'No Datadog SLO is defined for the app, so there is no error budget, no burn alerting, and the app cannot prove reliability against a target.';
    const howTo = ['In Datadog → Service Mgmt → SLOs → New SLO, choose Monitor-based'];
    if (synthetic) {
        howTo.push(`Base it on the existing synthetic ${synthetic.name}`);
    } else {
        howTo.push("Base it on the app's existing monitors / synthetics");
    }
    howTo.push(
        "Set a 99.9% target over a rolling 30-day window and link it to this app's service tag"
    );
    const evidence = synthetic
        ? `hasSLO=false · ${formatUptime(synthetic.uptime)} (no SLO object linked) · uptime30d=${orNotAvailable(facts.uptime)} · slaTarget=${orNotAvailable(facts.slaTarget)}`
        : `hasSLO=false · uptime30d=${orNotAvailable(facts.uptime)} · slaTarget=${orNotAvailable(facts.slaTarget)}`;
    return {
        id: 'rec-hasSLO',
        signal: 'hasSLO',
        title: 'Define a Datadog SLO',
        why,
        howTo,
        expectedMaturityDelta: SIGNAL_SEEDS.hasSLO.delta,
        effort: SIGNAL_SEEDS.hasSLO.effort,
        owner,
        evidence,
        confidence: SIGNAL_SEEDS.hasSLO.confidence,
    };
};

/**
 * Builds the !sloPassing action — grounds on the real synthetic uptime; absent values render "not available".
 * @param facts
 * @param owner
 */
const buildSloPassingAction = (facts: RecommendationFacts, owner: string): RecommendationAction => {
    const synthetic = firstSyntheticWithUptime(facts);
    const uptimeText = synthetic ? formatUptime(synthetic.uptime) : 'current uptime';
    const why = synthetic
        ? `Once an SLO exists, the current ${uptimeText} trails a 99.9% target — the error budget would already be exhausted, so this needs a reliability investigation. Blocked until an SLO is defined; complete "Define a Datadog SLO" first.`
        : 'Once an SLO exists, the current uptime trails the target — this needs a reliability investigation. Blocked until an SLO is defined; complete "Define a Datadog SLO" first.';
    const burnText =
        facts.burnRate?.rate == null
            ? 'not available until an SLO exists'
            : String(facts.burnRate.rate);
    return {
        id: 'rec-sloPassing',
        signal: 'sloPassing',
        title: 'Restore the SLO to passing',
        why,
        howTo: [
            synthetic
                ? `Identify the top failing synthetic steps / monitors driving the ${uptimeText}`
                : 'Identify the top failing synthetic steps / monitors driving the uptime gap',
            `Quantify the 30-day error-budget burn (burn rate: ${burnText})`,
            synthetic
                ? `Drive the uptime gap (${roundUptime(synthetic.uptime)}% → ≥ target) with the owning team`
                : 'Drive the uptime gap (→ ≥ target) with the owning team',
        ],
        expectedMaturityDelta: SIGNAL_SEEDS.sloPassing.delta,
        effort: SIGNAL_SEEDS.sloPassing.effort,
        owner,
        evidence: synthetic
            ? `sloPassing=false · ${formatUptime(synthetic.uptime)} · slaTarget=${orNotAvailable(facts.slaTarget)} · errorBudgetRemaining=${errorBudgetText(facts.errorBudgetRemainingPct)}`
            : `sloPassing=false · slaTarget=${orNotAvailable(facts.slaTarget)} · errorBudgetRemaining=${errorBudgetText(facts.errorBudgetRemainingPct)}`,
        confidence: SIGNAL_SEEDS.sloPassing.confidence,
    };
};

/**
 * Builds the !hasOwner action — grounds on the absence of every owner field.
 * @param owner
 */
const buildHasOwnerAction = (owner: string): RecommendationAction => ({
    id: 'rec-hasOwner',
    signal: 'hasOwner',
    title: 'Assign an accountable owner',
    why: "No IT, portfolio, or business owner is recorded, so there is nobody accountable for the app's reliability or to route incidents to.",
    howTo: [
        'Record an IT owner (and a portfolio/business owner) in PlanView',
        'Re-run the sync so the owner field populates',
    ],
    expectedMaturityDelta: SIGNAL_SEEDS.hasOwner.delta,
    effort: SIGNAL_SEEDS.hasOwner.effort,
    owner,
    evidence: 'hasOwner=false · itOwner / portfolioOwner / businessOwner all empty',
    confidence: SIGNAL_SEEDS.hasOwner.confidence,
});

/**
 * Builds the generic !other action (defensive — no candidate app reaches this today).
 * @param owner
 */
const buildOtherAction = (owner: string): RecommendationAction => ({
    id: 'rec-other',
    signal: 'other',
    title: 'Address the remaining maturity gap',
    why: 'A maturity signal is failing that does not map to a specific remediation; review the app against the maturity rubric.',
    howTo: [
        'Review the failing signal against the maturity rubric',
        'Close the gap with the owning team',
    ],
    expectedMaturityDelta: SIGNAL_SEEDS.other.delta,
    effort: SIGNAL_SEEDS.other.effort,
    owner,
    evidence: 'a maturity signal is failing',
    confidence: SIGNAL_SEEDS.other.confidence,
});

const ACTION_BUILDERS: Record<
    RecSignal,
    (facts: RecommendationFacts, owner: string) => RecommendationAction
> = {
    mapped: buildMappedAction,
    hasMonitor: buildHasMonitorAction,
    hasSLO: buildHasSloAction,
    sloPassing: buildSloPassingAction,
    hasOwner: (_facts, owner) => buildHasOwnerAction(owner),
    other: (_facts, owner) => buildOtherAction(owner),
};

/**
 * Ranking: cheap +1s first, then bigger deltas, then higher confidence, then signal order.
 * @param a
 * @param b
 */
const compareActions = (a: RecommendationAction, b: RecommendationAction): number =>
    EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort] ||
    b.expectedMaturityDelta - a.expectedMaturityDelta ||
    CONF_RANK[a.confidence] - CONF_RANK[b.confidence] ||
    SIGNAL_PRIORITY[a.signal] - SIGNAL_PRIORITY[b.signal];

const freshnessOf = (facts: RecommendationFacts): RecFreshness =>
    facts.lastSyncStatus === 'ok' ? 'live' : 'stale';

/**
 * Grounded "what blocks 5/5" headline; celebratory when nothing fails.
 * @param facts
 */
const buildNotes = (facts: RecommendationFacts): string => {
    if (facts.failingSignals.length === 0) {
        return 'Fully mature — all 5 maturity signals are passing. No actions needed.';
    }
    const hasSlo = facts.failingSignals.includes('hasSLO');
    const synthetic = firstSyntheticWithUptime(facts);
    if (hasSlo && synthetic) {
        return `No Datadog SLO is defined: uptime exists (${roundUptime(synthetic.uptime)}%) but is not formalized, so hasSLO and sloPassing both fail. Define the SLO first.`;
    }
    return `${facts.failingSignals.length} maturity signal(s) failing: ${facts.failingSignals.join(', ')}. Each one below is a +1 toward 5/5.`;
};

/**
 * Pure, deterministic builder — the grounded core the class delegates to.
 * @param facts
 */
const buildRecommendation = (facts: RecommendationFacts): RecommendationResult => {
    const owner = resolveOwner(facts);
    const actions = facts.failingSignals
        .map((signal) => ACTION_BUILDERS[signal](facts, owner))
        .sort(compareActions);

    return {
        appId: facts.appId,
        generatedAt: new Date().toISOString(),
        basedOnSyncAt: facts.basedOnSyncAt,
        currentScore: facts.currentScore,
        targetScore: 5,
        freshness: freshnessOf(facts),
        actions,
        notes: buildNotes(facts),
    };
};

/**
 * Deterministic, grounded recommendation client used until a real provider is wired.
 * Selected by config in {@link RecommendationsModule}. All logic lives in the module
 * function {@link buildRecommendation}, exposed here as a field reference so the bound
 * method carries no `this`-free body (the established `readonly foo = moduleFn` trick).
 */
@Injectable()
export default class MockLlmClient implements RecommendationLlmClient {
    /** Module-function reference — keeps all grounding logic out of the class. */
    private readonly build = buildRecommendation;

    /**
     * Generates grounded recommendations from the supplied facts.
     * @param {RecommendationFacts} facts - already-synced, grounded inputs
     * @returns {Promise<RecommendationResult>} the deterministic recommendation payload
     */
    async generate(facts: RecommendationFacts): Promise<RecommendationResult> {
        return this.build(facts);
    }
}
