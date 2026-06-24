import MongoPortfolioRepository from './mongo-portfolio.repository';
import { PortfolioBuilderUtility } from './portfolio-builder.utility';

type Maturity = { score: number; max: number; signals: Record<string, boolean> };
// computeMaturity lives on PortfolioBuilderUtility (pure derivation).
const computeMaturity = (app: Record<string, unknown>): Maturity =>
    PortfolioBuilderUtility.computeMaturity(app as never);

describe('MongoPortfolioRepository.computeMaturity', () => {
    it('scores a fully-instrumented, owned, SLO-passing app at max', () => {
        const m = computeMaturity({
            datadogMapped: true,
            monitors: [{ id: 1 }],
            uptime30d: 99.9,
            slaTarget: 99.5,
            itOwner: 'Jane Doe',
        });
        expect(m.signals).toEqual({
            mapped: true,
            hasMonitor: true,
            hasSLO: true,
            sloPassing: true,
            hasOwner: true,
        });
        expect(m.score).toBe(5);
        expect(m.max).toBe(5);
    });

    it('marks SLO not passing when uptime is below target (still counts has-SLO)', () => {
        const m = computeMaturity({
            datadogMapped: true,
            monitors: [{ id: 1 }],
            uptime30d: 98,
            slaTarget: 99.5,
            portfolioOwnerName: 'Platform Team',
        });
        expect(m.signals.hasSLO).toBe(true);
        expect(m.signals.sloPassing).toBe(false);
        expect(m.score).toBe(4); // mapped + hasMonitor + hasSLO + hasOwner
    });

    it('scores an unmapped, ownerless app at zero (never a misleading high score)', () => {
        const m = computeMaturity({
            datadogMapped: false,
            monitors: [],
            uptime30d: null,
            slaTarget: null,
        });
        expect(m.signals).toEqual({
            mapped: false,
            hasMonitor: false,
            hasSLO: false,
            sloPassing: false,
            hasOwner: false,
        });
        expect(m.score).toBe(0);
    });

    it('counts has-owner from any of itOwner / portfolioOwnerName / businessOwner', () => {
        expect(computeMaturity({ businessOwner: 'BU Lead' }).signals.hasOwner).toBe(true);
        expect(computeMaturity({}).signals.hasOwner).toBe(false);
    });
});

type Rollup = {
    appCount: number;
    healthyPct: number | null;
    coveragePct: number | null;
    sloPassingPct: number | null;
    avgMaturity: number | null;
    fastBurnCount: number;
};
// computeRollup is a private static (pure derivation) — reach it for a focused unit test.
const computeRollup = (apps: Record<string, unknown>[]): Rollup =>
    (
        MongoPortfolioRepository as unknown as {
            computeRollup: (a: unknown[]) => Rollup;
        }
    ).computeRollup(apps);

describe('MongoPortfolioRepository.computeRollup', () => {
    it('reports 100% healthy + 100% coverage + max maturity for a clean node', () => {
        const r = computeRollup([
            {
                datadogMapped: true,
                healthStatus: 'GREEN',
                monitors: [{ id: 1 }],
                uptime30d: 99.9,
                slaTarget: 99.5,
                itOwner: 'Jane Doe',
            },
            {
                datadogMapped: true,
                healthStatus: 'GREEN',
                monitors: [{ id: 2 }],
                uptime30d: 100,
                slaTarget: 99.5,
                itOwner: 'John Roe',
            },
        ]);
        expect(r.appCount).toBe(2);
        expect(r.healthyPct).toBe(100);
        expect(r.coveragePct).toBe(100);
        expect(r.sloPassingPct).toBe(100);
        expect(r.avgMaturity).toBe(5);
        expect(r.fastBurnCount).toBe(0);
    });

    it('aggregates a mixed node (partial coverage, one unhealthy, one fast burn)', () => {
        const r = computeRollup([
            {
                datadogMapped: true,
                healthStatus: 'GREEN',
                monitors: [{ id: 1 }],
                uptime30d: 99.9,
                slaTarget: 99.5,
                itOwner: 'Jane Doe',
            },
            {
                // mapped but RED, and burning at-risk (98 vs 99.5 -> 4.0)
                datadogMapped: true,
                healthStatus: 'RED',
                monitors: [{ id: 2 }],
                uptime30d: 98,
                slaTarget: 99.5,
                itOwner: 'John Roe',
            },
            {
                // unmapped, no SLO — counts against coverage, not GREEN
                datadogMapped: false,
                monitors: [],
                uptime30d: null,
                slaTarget: null,
            },
        ]);
        expect(r.appCount).toBe(3);
        // 1 of 3 GREEN
        expect(r.healthyPct).toBe(33.3);
        // 2 of 3 mapped
        expect(r.coveragePct).toBe(66.7);
        // 1 of 3 SLO passing (99.9 >= 99.5)
        expect(r.sloPassingPct).toBe(33.3);
        // one app at rate 4.0 (>= 1)
        expect(r.fastBurnCount).toBe(1);
    });

    it('never reports a false GREEN: an all-unmapped node is 0% coverage and 0% healthy', () => {
        const r = computeRollup([
            { datadogMapped: false, monitors: [] },
            { datadogMapped: false, monitors: [] },
        ]);
        expect(r.appCount).toBe(2);
        expect(r.coveragePct).toBe(0);
        expect(r.healthyPct).toBe(0);
        expect(r.fastBurnCount).toBe(0);
    });

    it('returns null percentages (not 0) for an empty node', () => {
        const r = computeRollup([]);
        expect(r).toEqual({
            appCount: 0,
            healthyPct: null,
            coveragePct: null,
            sloPassingPct: null,
            avgMaturity: null,
            fastBurnCount: 0,
        });
    });
});

type Burn = { rate: number | null; band: string };
// computeBurnRate lives on PortfolioBuilderUtility (pure derivation).
const computeBurnRate = (app: Record<string, unknown>): Burn =>
    PortfolioBuilderUtility.computeBurnRate(app as never);

describe('MongoPortfolioRepository.computeBurnRate', () => {
    it('99.9 uptime / 99.5 target -> 0.2x healthy', () => {
        const b = computeBurnRate({ uptime30d: 99.9, slaTarget: 99.5 });
        expect(b.rate).toBeCloseTo(0.2, 5);
        expect(b.band).toBe('healthy');
    });

    it('98 uptime / 99.5 target -> 4.0x at-risk', () => {
        const b = computeBurnRate({ uptime30d: 98, slaTarget: 99.5 });
        expect(b.rate).toBeCloseTo(4.0, 5);
        expect(b.band).toBe('at-risk');
    });

    it('99.4 uptime / 99.5 target -> 1.2x fast-burn', () => {
        const b = computeBurnRate({ uptime30d: 99.4, slaTarget: 99.5 });
        expect(b.rate).toBeCloseTo(1.2, 5);
        expect(b.band).toBe('fast-burn');
    });

    it('100 uptime / 99 target -> 0x healthy (clamped, never negative)', () => {
        const b = computeBurnRate({ uptime30d: 100, slaTarget: 99 });
        expect(b.rate).toBe(0);
        expect(b.band).toBe('healthy');
    });

    it('missing uptime -> null / unknown (honest missing-data, never a false GREEN)', () => {
        const b = computeBurnRate({ uptime30d: null, slaTarget: 99.5 });
        expect(b.rate).toBeNull();
        expect(b.band).toBe('unknown');
    });

    it('slaTarget of 100 (zero allowed budget) -> null / unknown (divide-by-zero guard)', () => {
        const b = computeBurnRate({ uptime30d: 99.9, slaTarget: 100 });
        expect(b.rate).toBeNull();
        expect(b.band).toBe('unknown');
    });
});

type Digest = {
    generatedAt: string;
    scope: 'all' | 'mine';
    rollup: { appCount: number; coveragePct: number | null };
    freshness: { ok: boolean; failedCount: number; lastSyncAt: string | null; note: string | null };
    priorPeriod: string | null;
    movers: unknown[];
    note: string | null;
};
// buildDigest is a private static (pure derivation) — reach it for a focused unit test.
const buildDigest = (apps: Record<string, unknown>[], email?: string): Digest =>
    (
        MongoPortfolioRepository as unknown as {
            buildDigest: (a: unknown[], e?: string) => Digest;
        }
    ).buildDigest(apps, email);

describe('MongoPortfolioRepository.buildDigest', () => {
    it('derives an unscoped digest with a healthy freshness stamp and no prior period', () => {
        const d = buildDigest([
            {
                datadogMapped: true,
                healthStatus: 'GREEN',
                monitors: [{ id: 1 }],
                uptime30d: 99.9,
                slaTarget: 99.5,
                itOwner: 'Jane Doe',
                lastSyncStatus: 'ok',
                lastSyncAt: '2026-06-20T12:00:00.000Z',
            },
            {
                datadogMapped: false,
                monitors: [],
                lastSyncStatus: 'unmapped',
                lastSyncAt: '2026-06-21T12:00:00.000Z',
            },
        ]);
        expect(d.scope).toBe('all');
        expect(d.rollup.appCount).toBe(2);
        // 1 of 2 mapped
        expect(d.rollup.coveragePct).toBe(50);
        expect(d.freshness.ok).toBe(true);
        expect(d.freshness.failedCount).toBe(0);
        // newest non-null lastSyncAt wins
        expect(d.freshness.lastSyncAt).toBe('2026-06-21T12:00:00.000Z');
        expect(d.priorPeriod).toBeNull();
        expect(d.movers).toEqual([]);
        expect(d.note).toMatch(/no prior period/i);
    });

    it('marks freshness not ok and surfaces a stale note when a last sync errored', () => {
        const d = buildDigest([
            {
                datadogMapped: true,
                healthStatus: 'GREEN',
                uptime30d: 99.9,
                slaTarget: 99.5,
                lastSyncStatus: 'ok',
                lastSyncAt: '2026-06-20T12:00:00.000Z',
            },
            {
                datadogMapped: true,
                healthStatus: 'RED',
                uptime30d: 98,
                slaTarget: 99.5,
                lastSyncStatus: 'error',
                lastSyncAt: '2026-06-19T12:00:00.000Z',
            },
        ]);
        expect(d.freshness.ok).toBe(false);
        expect(d.freshness.failedCount).toBe(1);
        expect(d.freshness.note).toMatch(/stale/i);
    });

    it('reports scope=mine when an owner email is supplied', () => {
        const d = buildDigest([{ datadogMapped: true, healthStatus: 'GREEN' }], 'user@example.com');
        expect(d.scope).toBe('mine');
    });

    it('degrades to a point-in-time snapshot for an empty set (no prior period)', () => {
        const d = buildDigest([]);
        expect(d.rollup.appCount).toBe(0);
        expect(d.rollup.coveragePct).toBeNull();
        expect(d.freshness.ok).toBe(true);
        expect(d.freshness.lastSyncAt).toBeNull();
        expect(d.priorPeriod).toBeNull();
        expect(d.movers).toEqual([]);
    });
});

type Tree = { children: { name: string }[] };
const buildPortfolio = (apps: unknown[], allowlist: string[] = []): Tree =>
    (
        MongoPortfolioRepository as unknown as {
            buildPortfolio: (a: unknown[], e: undefined, al: string[]) => Tree;
        }
    ).buildPortfolio(apps, undefined, allowlist);

describe('MongoPortfolioRepository.buildPortfolio — OpCo allowlist', () => {
    const apps = [
        { _id: '1', name: 'A', opCo: 'Mercer' },
        { _id: '2', name: 'B', opCo: 'Marsh' },
        { _id: '3', name: 'C', opCo: 'Mercer' },
    ];

    it('returns all OpCos when the allowlist is empty', () => {
        const tree = buildPortfolio(apps, []);
        expect(tree.children.map((c) => c.name).sort()).toEqual(['Marsh', 'Mercer']);
    });

    it('scopes the tree to the allowlist (case-insensitive)', () => {
        const tree = buildPortfolio(apps, ['mercer']);
        expect(tree.children.map((c) => c.name)).toEqual(['Mercer']);
    });
});

type AppContext = { app: { id: string; name: string }; path: { id: string; role: string }[] };
const buildSingleAppContext = (
    app: Record<string, unknown>,
    allowlist: string[] = []
): AppContext | null =>
    (
        MongoPortfolioRepository as unknown as {
            buildSingleAppContext: (a: unknown, al: string[]) => AppContext | null;
        }
    ).buildSingleAppContext(app, allowlist);

describe('MongoPortfolioRepository.buildSingleAppContext', () => {
    const sampleApp = {
        _id: 'abc123',
        name: 'TestApp',
        opCo: 'Mercer',
        businessDeliveryPortfolio: 'Digital - Platform',
        datadogMapped: true,
        healthStatus: 'GREEN',
        monitors: [{ id: 1 }],
        uptime30d: 99.9,
        slaTarget: 99.5,
        itOwner: 'Jane Doe',
        portfolioOwnerName: 'Portfolio Lead',
    };

    it('builds a single-app context with the correct hierarchy path', () => {
        const context = buildSingleAppContext(sampleApp);
        expect(context).not.toBeNull();
        expect(context!.app.id).toBe('abc123');
        expect(context!.app.name).toBe('TestApp');
        expect(context!.path).toHaveLength(4);
        expect(context!.path[0].role).toBe('Portfolio');
        expect(context!.path[1].role).toBe('Operating Company');
        expect(context!.path[2].role).toBe('Business Unit');
        expect(context!.path[3].role).toBe('LOB');
    });

    it('generates correct node IDs matching the tree builder pattern', () => {
        const context = buildSingleAppContext(sampleApp);
        expect(context!.path[0].id).toBe('application-portfolio');
        expect(context!.path[1].id).toBe('opco-mercer');
        expect(context!.path[2].id).toContain('business-unit-');
        expect(context!.path[3].id).toContain('lob-');
    });

    it('returns null when the app OpCo is not in the allowlist', () => {
        const context = buildSingleAppContext(sampleApp, ['marsh']);
        expect(context).toBeNull();
    });

    it('passes through when the allowlist is empty (all OpCos)', () => {
        const context = buildSingleAppContext(sampleApp, []);
        expect(context).not.toBeNull();
    });

    it('respects case-insensitive allowlist matching', () => {
        const context = buildSingleAppContext(sampleApp, ['MERCER']);
        expect(context).toBeNull(); // allowlist entries must already be lowercased
        const contextLower = buildSingleAppContext(sampleApp, ['mercer']);
        expect(contextLower).not.toBeNull();
    });

    it('handles an app with missing opCo (defaults to Unassigned)', () => {
        const app = { ...sampleApp, opCo: null };
        const context = buildSingleAppContext(app, []);
        expect(context).not.toBeNull();
        expect(context!.path[1].id).toBe('opco-unassigned');
    });
});

describe('MongoPortfolioRepository.cacheKey', () => {
    const cacheKey = (email?: string): string =>
        (
            MongoPortfolioRepository as unknown as {
                cacheKey: (e?: string) => string;
            }
        ).cacheKey(email);

    it('returns __all__ for undefined email', () => {
        expect(cacheKey(undefined)).toBe('__all__');
    });

    it('lowercases the email for consistent cache hits', () => {
        expect(cacheKey('User@Example.COM')).toBe('user@example.com');
    });
});
