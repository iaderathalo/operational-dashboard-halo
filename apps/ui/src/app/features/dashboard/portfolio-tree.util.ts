import { PortfolioNode, PortfolioApp } from './models/portfolio.model';

/**
 * Collects every application in the provided subtree (including the node's own
 * `apps`, recursing through every descendant). Extracted from
 * `PortfolioPageComponent` (US-2.4) so `FiringMonitorsPageComponent` can derive its
 * row set from the exact same tree traversal the Monitors rollup tile already
 * counts from — the tile's count and the list's rows can never drift apart.
 * @param {PortfolioNode} node - portfolio node to traverse
 * @returns {PortfolioApp[]} flattened application list
 */
export function getAllApps(node: PortfolioNode): PortfolioApp[] {
    let apps = [...(node.apps || [])];
    (node.children || []).forEach((c) => {
        apps = apps.concat(getAllApps(c));
    });
    return apps;
}

/**
 * Finds a node by id within the portfolio tree. Extracted from
 * `PortfolioPageComponent` (US-2.4) — `node` is required (no default) so it works
 * standalone outside a component instance.
 * @param {string} id - node id to find
 * @param {PortfolioNode} node - current tree branch
 * @returns {PortfolioNode | null} matching node when found
 */
export function findNode(id: string, node: PortfolioNode): PortfolioNode | null {
    if (node.id === id) return node;

    return (
        (node.children || [])
            .map((child) => findNode(id, child))
            .find((child): child is PortfolioNode => child !== null) || null
    );
}
