import { RecommendationResult } from '@operational-dashboard/shared-api-model/model/dashboard';

import MockLlmClient from './mock-llm-client';
import { RecommendationFacts } from './recommendation-llm-client';
import { repairRecommendation, validateRecommendation } from './recommendation-validator';

const facts = (): RecommendationFacts => ({
    appId: '6a3153464907b47284e92d1c',
    appName: 'Auto Choice Platform - Mercer',
    basedOnSyncAt: '2026-06-24T03:39:31.290Z',
    lastSyncStatus: 'ok',
    currentScore: 3,
    signals: { mapped: true, hasMonitor: true, hasSLO: false, sloPassing: false, hasOwner: true },
    failingSignals: ['hasSLO', 'sloPassing'],
    monitorNames: [],
    syntheticChecks: [
        {
            name: 'Mercer_USA_Auto_SyntheticMonitoring_SNSVC0001214_AUCHPL',
            uptime: 93.99189758300781,
        },
    ],
    uptime: null,
    slaTarget: null,
    burnRate: { rate: null, band: 'unknown' },
    errorBudgetRemainingPct: null,
    owners: { itOwner: 'Rhonda Martens', portfolioOwnerName: null, businessOwner: null },
    resolutionPath: 'primary',
    appShortKey: 'AUCHPL',
});

/** A minimal valid base payload (no actions) for the chosen facts. */
const mock = (): RecommendationResult => ({
    appId: '6a3153464907b47284e92d1c',
    generatedAt: '2026-06-24T04:00:00.000Z',
    basedOnSyncAt: '2026-06-24T03:39:31.290Z',
    currentScore: 3,
    targetScore: 5,
    freshness: 'live',
    actions: [],
    notes: 'note',
});

describe('validateRecommendation', () => {
    it('accepts the grounded mock output', async () => {
        const result = await new MockLlmClient().generate(facts());
        expect(validateRecommendation(result, facts())).toEqual([]);
    });

    it('rejects targetScore other than 5', () => {
        const broken = { ...mock(), targetScore: 4 };
        expect(validateRecommendation(broken, facts())).toContain('targetScore must be 5');
    });

    it('rejects an action that cites a number absent from FACTS (hallucinated value)', () => {
        const hallucinated: RecommendationResult = {
            ...mock(),
            actions: [
                {
                    id: 'rec-hasSLO',
                    signal: 'hasSLO',
                    title: 'Define a Datadog SLO',
                    why: 'grounded prose',
                    howTo: ['step'],
                    expectedMaturityDelta: 1,
                    effort: 'medium',
                    owner: 'Rhonda Martens (IT)',
                    // 99.95 is NOT present anywhere in FACTS — must be rejected.
                    evidence: 'hasSLO=false · synthetic uptime 99.95%',
                    confidence: 'high',
                },
            ],
        };
        const violations = validateRecommendation(hallucinated, facts());
        expect(violations.some((v) => v.includes('hasSLO'))).toBe(true);
    });

    it('rejects an action whose signal is not actually failing', () => {
        const ungrounded: RecommendationResult = {
            ...mock(),
            actions: [
                {
                    id: 'rec-mapped',
                    signal: 'mapped', // mapped is passing in FACTS
                    title: 'Map the app',
                    why: 'prose',
                    howTo: ['step'],
                    expectedMaturityDelta: 1,
                    effort: 'low',
                    owner: 'Rhonda Martens (IT)',
                    evidence: 'mapped=false',
                    confidence: 'high',
                },
            ],
        };
        expect(validateRecommendation(ungrounded, facts()).some((v) => v.includes('mapped'))).toBe(
            true
        );
    });

    it('catches a hallucinated number hidden in why/howTo, not just evidence', () => {
        const hallucinated: RecommendationResult = {
            ...mock(),
            actions: [
                {
                    id: 'rec-hasSLO',
                    signal: 'hasSLO',
                    title: 'Define a Datadog SLO',
                    // 73.2 is absent from FACTS — must be caught in `why`, not only `evidence`.
                    why: 'Uptime is only 73.2% so an SLO is overdue',
                    howTo: ['step'],
                    expectedMaturityDelta: 1,
                    effort: 'medium',
                    owner: 'Rhonda Martens (IT)',
                    evidence: 'hasSLO=false',
                    confidence: 'high',
                },
            ],
        };
        expect(
            validateRecommendation(hallucinated, facts()).some((v) => v.includes('hasSLO'))
        ).toBe(true);
    });

    it('treats identifier digits (a synthetic name) in how-to as grounded, not a value', () => {
        const grounded: RecommendationResult = {
            ...mock(),
            actions: [
                {
                    id: 'rec-hasSLO',
                    signal: 'hasSLO',
                    title: 'Define a Datadog SLO',
                    why: 'No SLO is defined',
                    // The synthetic name carries a ServiceNow id (digits) — grounded, not a metric.
                    howTo: ['Base it on Mercer_USA_Auto_SyntheticMonitoring_SNSVC0001214_AUCHPL'],
                    expectedMaturityDelta: 1,
                    effort: 'medium',
                    owner: 'Rhonda Martens (IT)',
                    evidence: 'hasSLO=false',
                    confidence: 'high',
                },
            ],
        };
        expect(validateRecommendation(grounded, facts())).toEqual([]);
    });
});

describe('repairRecommendation', () => {
    it('drops ungrounded actions, forces targetScore=5, then re-validates clean', () => {
        const broken: RecommendationResult = {
            ...mock(),
            targetScore: 9,
            actions: [
                {
                    id: 'rec-hasSLO',
                    signal: 'hasSLO',
                    title: 'Define a Datadog SLO',
                    why: 'prose',
                    howTo: ['step'],
                    expectedMaturityDelta: 1,
                    effort: 'medium',
                    owner: 'Rhonda Martens (IT)',
                    evidence: 'hasSLO=false · synthetic uptime 88.88%', // hallucinated
                    confidence: 'high',
                },
            ],
        };
        const repaired = repairRecommendation(broken, facts());
        expect(repaired.targetScore).toBe(5);
        expect(repaired.actions).toEqual([]);
        expect(validateRecommendation(repaired, facts())).toEqual([]);
    });

    it('defaults freshness from the sync status when invalid', () => {
        const broken = { ...mock(), freshness: 'bogus' as never };
        expect(repairRecommendation(broken, facts()).freshness).toBe('live');
    });
});
