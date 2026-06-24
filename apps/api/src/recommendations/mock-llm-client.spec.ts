import MockLlmClient from './mock-llm-client';
import { RecommendationFacts } from './recommendation-llm-client';

/**
 * Facts for the chosen teaching app "Auto Choice Platform - Mercer"
 * (6a3153464907b47284e92d1c): score 3/5, hasSLO + sloPassing failing, a real
 * synthetic at 93.99% uptime, no SLO object so slaTarget / burnRate / errorBudget
 * are all null.
 * @param overrides
 */
const mercerFacts = (overrides: Partial<RecommendationFacts> = {}): RecommendationFacts => ({
    appId: '6a3153464907b47284e92d1c',
    appName: 'Auto Choice Platform - Mercer',
    basedOnSyncAt: '2026-06-24T03:39:31.290Z',
    lastSyncStatus: 'ok',
    currentScore: 3,
    signals: {
        mapped: true,
        hasMonitor: true,
        hasSLO: false,
        sloPassing: false,
        hasOwner: true,
    },
    failingSignals: ['hasSLO', 'sloPassing'],
    monitorNames: [
        '[Synthetics] Mercer_USA_Auto_SNSVC0001214_AUCHPL',
        '[Synthetics] Mercer_USA_Auto_SyntheticMonitoring_SNSVC0001214_AUCHPL',
    ],
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
    owners: {
        itOwner: 'Rhonda Martens',
        portfolioOwnerName: 'Jorie Blackwell',
        businessOwner: 'Kimberly Fleming (776926)',
    },
    resolutionPath: 'primary',
    appShortKey: 'AUCHPL',
    ...overrides,
});

describe('MockLlmClient.generate (grounded, deterministic)', () => {
    const client = new MockLlmClient();

    it('emits exactly the two failing signals as +1 actions, hasSLO before sloPassing', async () => {
        const result = await client.generate(mercerFacts());

        expect(result.actions).toHaveLength(2);
        expect(result.actions.map((a) => a.signal)).toEqual(['hasSLO', 'sloPassing']);
        expect(result.actions.every((a) => a.expectedMaturityDelta === 1)).toBe(true);
        // effort asc puts medium (hasSLO) before high (sloPassing).
        expect(result.actions[0].effort).toBe('medium');
        expect(result.actions[1].effort).toBe('high');
    });

    it('grounds the SLO action on the real synthetic uptime (93.99)', async () => {
        const result = await client.generate(mercerFacts());
        const sloAction = result.actions.find((a) => a.signal === 'hasSLO');

        expect(sloAction?.evidence).toContain('93.99');
        expect(sloAction?.evidence).toContain('hasSLO=false');
        expect(sloAction?.confidence).toBe('high');
        expect(sloAction?.owner).toBe('Rhonda Martens (IT)');
    });

    it('renders absent measured values as "not available", never a fabricated number', async () => {
        const result = await client.generate(mercerFacts());
        const passingAction = result.actions.find((a) => a.signal === 'sloPassing');

        // slaTarget / errorBudget are null in FACTS — must read "not available".
        expect(passingAction?.evidence).toContain('slaTarget=not available');
        expect(passingAction?.evidence).toContain('errorBudgetRemaining=not available');
        // The 99.9% target only ever appears as a suggested target in how-to, never as
        // a measured value in evidence.
        expect(passingAction?.evidence).not.toContain('99.9');
        expect(passingAction?.evidence).not.toContain('100%');
    });

    it('never emits a value or monitor name absent from FACTS (anti-hallucination)', async () => {
        const facts = mercerFacts();
        const result = await client.generate(facts);

        // Grounded identifiers (synthetic / monitor names) are FACTS verbatim; strip them
        // first so their embedded id digits are not mistaken for fabricated measurements.
        const factNames = [...facts.syntheticChecks.map((c) => c.name), ...facts.monitorNames];

        // Any synthetic / monitor name that appears in the output must be one from FACTS.
        const identifierTexts = result.actions
            .flatMap((action) => [action.evidence, action.why, ...action.howTo])
            .filter((text) => text.includes('SyntheticMonitoring') || text.includes('SNSVC'));
        identifierTexts.forEach((text) => {
            expect(factNames.some((name) => text.includes(name))).toBe(true);
        });

        const allowedNumbers = new Set<number>([
            facts.currentScore,
            93.99,
            93.99189758300781,
            5,
            99.9,
            30,
            0,
            1,
        ]);
        const stripNames = (text: string): string =>
            factNames.reduce((acc, name) => acc.split(name).join(' '), text);
        const numericTokens = result.actions
            .flatMap((action) => [action.evidence, action.why, ...action.howTo])
            .map(stripNames)
            .flatMap((text) => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
        numericTokens.forEach((value) => {
            expect(allowedNumbers.has(value)).toBe(true);
        });
    });

    it('reports freshness=live when the last sync was ok', async () => {
        const result = await client.generate(mercerFacts());
        expect(result.freshness).toBe('live');
        expect(result.currentScore).toBe(3);
        expect(result.targetScore).toBe(5);
        expect(result.basedOnSyncAt).toBe('2026-06-24T03:39:31.290Z');
        expect(result.notes).toContain('93.99');
    });

    it('reports freshness=stale on an errored or unmapped sync', async () => {
        const errored = await client.generate(mercerFacts({ lastSyncStatus: 'error' }));
        expect(errored.freshness).toBe('stale');

        const unmapped = await client.generate(mercerFacts({ lastSyncStatus: 'unmapped' }));
        expect(unmapped.freshness).toBe('stale');
    });

    it('returns no actions and a celebratory note for a fully mature 5/5 app', async () => {
        const result = await client.generate(
            mercerFacts({
                currentScore: 5,
                signals: {
                    mapped: true,
                    hasMonitor: true,
                    hasSLO: true,
                    sloPassing: true,
                    hasOwner: true,
                },
                failingSignals: [],
            })
        );

        expect(result.actions).toEqual([]);
        expect(result.notes.toLowerCase()).toContain('fully mature');
    });

    it('falls back to "unassigned" owner when no owner field is present', async () => {
        const result = await client.generate(
            mercerFacts({
                owners: { itOwner: null, portfolioOwnerName: null, businessOwner: null },
            })
        );
        expect(result.actions.every((a) => a.owner === 'unassigned')).toBe(true);
    });
});
