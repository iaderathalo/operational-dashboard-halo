import MongoPortfolioRepository from './mongo-portfolio.repository';

type Maturity = { score: number; max: number; signals: Record<string, boolean> };
// computeMaturity is a private static (pure derivation) — reach it for a focused unit test.
const computeMaturity = (app: Record<string, unknown>): Maturity =>
    (
        MongoPortfolioRepository as unknown as {
            computeMaturity: (a: unknown) => Maturity;
        }
    ).computeMaturity(app);

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
