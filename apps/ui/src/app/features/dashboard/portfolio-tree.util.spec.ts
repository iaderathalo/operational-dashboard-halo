import { PortfolioApp, PortfolioNode } from './models/portfolio.model';
import { findNode, getAllApps } from './portfolio-tree.util';

/**
 * Minimal valid PortfolioApp builder for tree-util tests.
 * @param overrides
 */
function makeApp(overrides: Partial<PortfolioApp>): PortfolioApp {
    return {
        id: 'app',
        name: 'App',
        health: 'green',
        perception: 'green',
        uptime: null,
        users: 0,
        totalInternalUsers: 0,
        totalExternalUsers: 0,
        activeUsers: null,
        incidents: 0,
        lastIncident: '',
        ...overrides,
    };
}

/**
 * Minimal valid PortfolioNode builder for tree-util tests.
 * @param overrides
 */
function makeNode(overrides: Partial<PortfolioNode>): PortfolioNode {
    return {
        id: 'root',
        name: 'Root',
        role: '',
        owner: '',
        children: [],
        apps: [],
        ...overrides,
    };
}

describe('getAllApps', () => {
    it('returns [] for a leaf node with no apps', () => {
        expect(getAllApps(makeNode({}))).toEqual([]);
    });

    it("returns a node's own apps", () => {
        const app = makeApp({ id: 'a1' });
        expect(getAllApps(makeNode({ apps: [app] }))).toEqual([app]);
    });

    it('recurses through descendant nodes', () => {
        const a1 = makeApp({ id: 'a1' });
        const a2 = makeApp({ id: 'a2' });
        const tree = makeNode({
            apps: [a1],
            children: [
                makeNode({ id: 'child-1', apps: [a2] }),
                makeNode({ id: 'child-2', children: [makeNode({ id: 'grandchild' })] }),
            ],
        });

        const apps = getAllApps(tree);
        expect(apps).toHaveLength(2);
        expect(apps).toEqual(expect.arrayContaining([a1, a2]));
    });

    it('tolerates a node with no children array', () => {
        const node = makeNode({});
        // @ts-expect-error - exercising the `node.children || []` defensive default
        delete node.children;
        expect(() => getAllApps(node)).not.toThrow();
    });
});

describe('findNode', () => {
    it('returns the root when its own id matches', () => {
        const tree = makeNode({ id: 'root' });
        expect(findNode('root', tree)).toBe(tree);
    });

    it('finds a nested descendant by id', () => {
        const target = makeNode({ id: 'target' });
        const tree = makeNode({
            children: [makeNode({ id: 'branch', children: [target] })],
        });
        expect(findNode('target', tree)).toBe(target);
    });

    it('returns null when the id is not present anywhere in the tree', () => {
        const tree = makeNode({ children: [makeNode({ id: 'child' })] });
        expect(findNode('missing', tree)).toBeNull();
    });

    it('tolerates a node with no children array', () => {
        const node = makeNode({});
        // @ts-expect-error - exercising the `node.children || []` defensive default
        delete node.children;
        expect(() => findNode('anything', node)).not.toThrow();
    });
});
