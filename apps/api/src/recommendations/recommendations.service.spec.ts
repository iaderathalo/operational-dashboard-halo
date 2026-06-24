import { NotFoundException } from '@nestjs/common';

import { RecommendationResult } from '@operational-dashboard/shared-api-model/model/dashboard';

import MockLlmClient from './mock-llm-client';
import { RecommendationFacts, RecommendationLlmClient } from './recommendation-llm-client';
import RecommendationsService, { buildFacts } from './recommendations.service';
import { PortfolioApp, PortfolioAppContext } from '../dashboard/portfolio.model';
import { PortfolioRepository } from '../dashboard/portfolio.repository';

const baseApp = (overrides: Partial<PortfolioApp> = {}): PortfolioApp =>
    ({
        id: '6a3153464907b47284e92d1c',
        name: 'Auto Choice Platform - Mercer',
        health: 'amber',
        perception: 'undefined',
        uptime: null,
        slaTarget: null,
        errorBudgetRemainingPct: null,
        burnRate: { rate: null, band: 'unknown' },
        datadogMapped: true,
        resolutionPath: 'primary',
        lastSyncStatus: 'ok',
        lastSyncAt: '2026-06-24T03:39:31.290Z',
        monitors: [
            {
                id: 1,
                name: '[Synthetics] Mercer_USA_Auto_SNSVC0001214_AUCHPL',
                status: 'GREEN',
                message: '',
                lastTriggeredAt: null,
                inMaintenance: false,
            },
        ],
        syntheticChecks: [
            {
                name: 'Mercer_USA_Auto_SyntheticMonitoring_SNSVC0001214_AUCHPL',
                type: 'browser',
                status: 'live',
                uptime: 93.99189758300781,
            },
        ],
        maturity: {
            score: 3,
            max: 5,
            signals: {
                mapped: true,
                hasMonitor: true,
                hasSLO: false,
                sloPassing: false,
                hasOwner: true,
            },
        },
        users: 6100100,
        totalInternalUsers: 0,
        totalExternalUsers: 0,
        activeUsers: null,
        incidents: 0,
        lastIncident: '—',
        itOwner: 'Rhonda Martens',
        portfolioOwnerName: 'Jorie Blackwell',
        businessOwner: 'Kimberly Fleming (776926)',
        ...overrides,
    }) as PortfolioApp;

type StubRepository = PortfolioRepository & {
    readonly calls: number;
    setApp(app: PortfolioApp | null): void;
};

/**
 * A repository stub that records how many times getAppContext is called.
 * @param initialApp
 */
const createStubRepository = (initialApp: PortfolioApp | null): StubRepository => {
    let app = initialApp;
    let callCount = 0;
    return {
        get calls(): number {
            return callCount;
        },
        setApp(next: PortfolioApp | null): void {
            app = next;
        },
        async getAppContext(): Promise<PortfolioAppContext | null> {
            callCount += 1;
            return app ? { app, path: [] } : null;
        },
        async getPortfolio(): Promise<never> {
            throw new Error('not used');
        },
        async getAppDetail(): Promise<never> {
            throw new Error('not used');
        },
        async getDigest(): Promise<never> {
            throw new Error('not used');
        },
    };
};

type CountingClient = RecommendationLlmClient & { readonly calls: number };

/** A client that counts generate() calls so cache behavior is observable. */
const createCountingClient = (): CountingClient => {
    const inner = new MockLlmClient();
    let callCount = 0;
    return {
        get calls(): number {
            return callCount;
        },
        async generate(facts: RecommendationFacts): Promise<RecommendationResult> {
            callCount += 1;
            return inner.generate(facts);
        },
    };
};

describe('buildFacts', () => {
    it('maps the stored app verbatim and never recomputes maturity', () => {
        const facts = buildFacts(baseApp());

        expect(facts.currentScore).toBe(3);
        expect(facts.failingSignals).toEqual(['hasSLO', 'sloPassing']);
        expect(facts.syntheticChecks).toEqual([
            {
                name: 'Mercer_USA_Auto_SyntheticMonitoring_SNSVC0001214_AUCHPL',
                uptime: 93.99189758300781,
            },
        ]);
        expect(facts.uptime).toBeNull();
        expect(facts.slaTarget).toBeNull();
        expect(facts.owners.itOwner).toBe('Rhonda Martens');
        expect(facts.basedOnSyncAt).toBe('2026-06-24T03:39:31.290Z');
        expect(facts.lastSyncStatus).toBe('ok');
    });

    it('derives the app short key from a linked monitor/synthetic name', () => {
        expect(buildFacts(baseApp()).appShortKey).toBe('AUCHPL');
    });

    it('returns null short key when no name carries a trailing key', () => {
        const app = baseApp({ monitors: [], syntheticChecks: [] });
        expect(buildFacts(app).appShortKey).toBeNull();
    });
});

describe('RecommendationsService', () => {
    it('builds facts and generates without any Datadog call', async () => {
        const repo = createStubRepository(baseApp());
        const client = createCountingClient();
        const service = new RecommendationsService(repo, client);

        const result = await service.getRecommendations('6a3153464907b47284e92d1c');

        expect(result.currentScore).toBe(3);
        expect(result.actions.map((a) => a.signal)).toEqual(['hasSLO', 'sloPassing']);
        expect(repo.calls).toBe(1);
        expect(client.calls).toBe(1);
    });

    it('serves the cached result on a second call with the same sync', async () => {
        const repo = createStubRepository(baseApp());
        const client = createCountingClient();
        const service = new RecommendationsService(repo, client);

        await service.getRecommendations('6a3153464907b47284e92d1c');
        await service.getRecommendations('6a3153464907b47284e92d1c');

        expect(client.calls).toBe(1);
    });

    it('invalidates the cache when lastSyncAt changes (never serves stale-on-newer)', async () => {
        const repo = createStubRepository(baseApp());
        const client = createCountingClient();
        const service = new RecommendationsService(repo, client);

        await service.getRecommendations('6a3153464907b47284e92d1c');
        repo.setApp(baseApp({ lastSyncAt: '2026-06-25T00:00:00.000Z' }));
        await service.getRecommendations('6a3153464907b47284e92d1c');

        expect(client.calls).toBe(2);
    });

    it('re-generates when refresh=1 even for the same sync', async () => {
        const repo = createStubRepository(baseApp());
        const client = createCountingClient();
        const service = new RecommendationsService(repo, client);

        await service.getRecommendations('6a3153464907b47284e92d1c');
        await service.getRecommendations('6a3153464907b47284e92d1c', undefined, true);

        expect(client.calls).toBe(2);
    });

    it('throws NotFound when the app is out of scope or unknown', async () => {
        const service = new RecommendationsService(
            createStubRepository(null),
            createCountingClient()
        );

        await expect(service.getRecommendations('missing')).rejects.toBeInstanceOf(
            NotFoundException
        );
    });

    it('echoes freshness=stale through when the sync errored', async () => {
        const repo = createStubRepository(baseApp({ lastSyncStatus: 'error' }));
        const service = new RecommendationsService(repo, createCountingClient());

        const result = await service.getRecommendations('6a3153464907b47284e92d1c');
        expect(result.freshness).toBe('stale');
    });
});
