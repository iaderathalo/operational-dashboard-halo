import {
    RecConfidence,
    RecEffort,
    RecFreshness,
    RecommendationAction,
    RecommendationResult,
    RecSignal,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import { RecommendationFacts } from './recommendation-llm-client';

const SIGNALS: RecSignal[] = ['mapped', 'hasMonitor', 'hasSLO', 'sloPassing', 'hasOwner', 'other'];
const EFFORTS: RecEffort[] = ['low', 'medium', 'high'];
const CONFIDENCES: RecConfidence[] = ['high', 'medium', 'low'];
const FRESHNESSES: RecFreshness[] = ['live', 'stale'];

/**
 * Numbers the model is allowed to cite — every numeric value present in FACTS.
 * @param facts
 */
const groundedNumbers = (facts: RecommendationFacts): Set<number> => {
    const allowed = new Set<number>();
    const add = (value: number | null | undefined): void => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            allowed.add(value);
            // Allow display-roundings of the SAME measured value (2dp / 1dp / integer) — a
            // rounded citation of a grounded value is honest, not a hallucinated number.
            allowed.add(Math.round(value * 100) / 100);
            allowed.add(Math.round(value * 10) / 10);
            allowed.add(Math.round(value));
        }
    };
    add(facts.currentScore);
    add(facts.uptime);
    add(facts.slaTarget);
    add(facts.errorBudgetRemainingPct);
    add(facts.burnRate?.rate ?? null);
    facts.syntheticChecks.forEach((check) => add(check.uptime));
    // The target/window constants the how-to may legitimately suggest.
    allowed.add(5); // targetScore / maturity max
    allowed.add(99.9); // suggested SLO target
    allowed.add(30); // rolling 30-day window
    allowed.add(0);
    allowed.add(1);
    return allowed;
};

/**
 * Extracts every numeric literal from a string (handles decimals).
 * @param text
 */
const numbersIn = (text: string): number[] =>
    (text.match(/\d+(?:\.\d+)?/g) ?? []).map((token) => Number(token));

/**
 * Identifier strings the model may cite verbatim — monitor / synthetic names, the app
 * short key, owner names. Their embedded digits (e.g. a ServiceNow id inside a synthetic
 * name) are identifiers, NOT metric values, so they are stripped before the numeric
 * grounding check below.
 * @param {RecommendationFacts} facts - the grounded inputs
 * @returns {string[]} the grounded identifier strings
 */
const groundedStrings = (facts: RecommendationFacts): string[] => {
    const out: string[] = [];
    const add = (value: string | null | undefined): void => {
        if (typeof value === 'string' && value.trim().length > 0) {
            out.push(value);
        }
    };
    add(facts.appName);
    add(facts.appShortKey);
    facts.monitorNames.forEach(add);
    facts.syntheticChecks.forEach((check) => add(check.name));
    add(facts.owners.itOwner);
    add(facts.owners.portfolioOwnerName);
    add(facts.owners.businessOwner);
    return out;
};

/**
 * True when every number cited in `text` is present in the grounded set — AFTER removing
 * grounded identifier strings, whose embedded digits are identifiers, not metric values.
 * @param {string} text - the prose to check
 * @param {Set<number>} allowed - the grounded numeric values
 * @param {string[]} identifiers - grounded identifier strings to strip first
 * @returns {boolean} whether every remaining number is grounded
 */
const isGroundedText = (text: string, allowed: Set<number>, identifiers: string[]): boolean => {
    // Strip longest-first so a full name is removed before any shorter identifier that is a
    // substring of it (e.g. the app key as the synthetic name's suffix).
    const ordered = [...identifiers].sort((left, right) => right.length - left.length);
    const stripped = ordered.reduce((acc, id) => acc.split(id).join(' '), text);
    return numbersIn(stripped).every((value) => allowed.has(value));
};

/**
 * Validates a single action against the enums and the grounding gate.
 * @param action
 * @param facts
 * @param allowed
 * @param identifiers
 */
const isValidAction = (
    action: RecommendationAction,
    facts: RecommendationFacts,
    allowed: Set<number>,
    identifiers: string[]
): boolean => {
    if (!action || typeof action !== 'object') {
        return false;
    }
    if (!SIGNALS.includes(action.signal)) {
        return false;
    }
    if (!EFFORTS.includes(action.effort)) {
        return false;
    }
    if (!CONFIDENCES.includes(action.confidence)) {
        return false;
    }
    if (!Number.isInteger(action.expectedMaturityDelta) || action.expectedMaturityDelta < 0) {
        return false;
    }
    if (!Array.isArray(action.howTo) || action.howTo.length === 0) {
        return false;
    }
    if (typeof action.evidence !== 'string' || action.evidence.length === 0) {
        return false;
    }
    if (typeof action.why !== 'string' || action.why.length === 0) {
        return false;
    }
    // Grounding gate: only recommend a signal that is actually failing, and never cite a
    // number that is absent from FACTS in ANY prose field — evidence, why, AND each how-to
    // step (anti-hallucination). This holds a future real LLM provider to the same bar the
    // mock meets, not just the `evidence` line.
    if (!facts.failingSignals.includes(action.signal)) {
        return false;
    }
    return [action.evidence, action.why, ...action.howTo].every((text) =>
        isGroundedText(String(text ?? ''), allowed, identifiers)
    );
};

/**
 * Asserts a recommendation payload is well-formed AND grounded in the supplied facts.
 * Returns a list of human-readable violations (empty ⇒ valid). Holds the future real
 * provider to the same bar the mock meets.
 * @param {RecommendationResult} raw - the payload to check
 * @param {RecommendationFacts} facts - the grounded inputs it must respect
 * @returns {string[]} the violations found (empty when valid)
 */
export const validateRecommendation = (
    raw: RecommendationResult,
    facts: RecommendationFacts
): string[] => {
    const violations: string[] = [];
    if (!raw || typeof raw !== 'object') {
        return ['result is not an object'];
    }
    if (typeof raw.appId !== 'string') {
        violations.push('appId missing');
    }
    if (typeof raw.generatedAt !== 'string') {
        violations.push('generatedAt missing');
    }
    if (typeof raw.currentScore !== 'number' || raw.currentScore < 0 || raw.currentScore > 5) {
        violations.push('currentScore out of range');
    }
    if (raw.targetScore !== 5) {
        violations.push('targetScore must be 5');
    }
    if (!FRESHNESSES.includes(raw.freshness)) {
        violations.push('freshness invalid');
    }
    if (typeof raw.notes !== 'string') {
        violations.push('notes missing');
    }
    if (!Array.isArray(raw.actions)) {
        violations.push('actions missing');
        return violations;
    }
    const allowed = groundedNumbers(facts);
    const identifiers = groundedStrings(facts);
    raw.actions.forEach((action, index) => {
        if (!isValidAction(action, facts, allowed, identifiers)) {
            violations.push(
                `action[${index}] (${action?.signal ?? 'unknown'}) malformed or ungrounded`
            );
        }
    });
    return violations;
};

/**
 * Default freshness derived from the sync status, used when repairing.
 * @param facts
 */
const defaultFreshness = (facts: RecommendationFacts): RecFreshness =>
    facts.lastSyncStatus === 'ok' ? 'live' : 'stale';

/**
 * Conservatively repairs a payload: drops malformed/ungrounded actions, clamps the
 * current score, forces targetScore=5, and defaults freshness from the sync status.
 * Never invents actions. Callers re-validate after repair.
 * @param {RecommendationResult} raw - the payload to repair
 * @param {RecommendationFacts} facts - the grounded inputs
 * @returns {RecommendationResult} the repaired payload
 */
export const repairRecommendation = (
    raw: RecommendationResult,
    facts: RecommendationFacts
): RecommendationResult => {
    const allowed = groundedNumbers(facts);
    const identifiers = groundedStrings(facts);
    const actions = Array.isArray(raw?.actions)
        ? raw.actions.filter((action) => isValidAction(action, facts, allowed, identifiers))
        : [];
    const clampedScore = Math.min(5, Math.max(0, Number(raw?.currentScore) || facts.currentScore));
    return {
        appId: typeof raw?.appId === 'string' ? raw.appId : facts.appId,
        generatedAt:
            typeof raw?.generatedAt === 'string' ? raw.generatedAt : new Date().toISOString(),
        basedOnSyncAt: raw?.basedOnSyncAt ?? facts.basedOnSyncAt,
        currentScore: clampedScore,
        targetScore: 5,
        freshness: FRESHNESSES.includes(raw?.freshness) ? raw.freshness : defaultFreshness(facts),
        actions,
        notes: typeof raw?.notes === 'string' ? raw.notes : '',
    };
};
