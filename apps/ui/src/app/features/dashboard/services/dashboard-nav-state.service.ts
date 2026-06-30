import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root',
})
export default class DashboardNavStateService {
    private lastNodeId: string | null = null;

    /** Last app id opened from the table or the top-bar search — used to expand the tree to it. */
    private lastAppId: string | null = null;

    private lastScrollTop = 0;

    /** Sidebar tree nodes that were expanded before leaving the portfolio page. */
    private lastExpandedTreeNodes: Set<string> = new Set();

    /** Section panels that were expanded before leaving the portfolio page. */
    private lastExpandedSections: Set<string> = new Set();

    /**
     * Records the last visited portfolio node id, scroll position, and tree/section
     * expansion state before navigating away. Copies of the Sets are stored so the
     * caller can mutate its own Sets without affecting the saved snapshot.
     * @param {string} nodeId - The portfolio node id that was active.
     * @param {number} scrollTop - The vertical scroll offset of the table container.
     * @param {Set<string>} expandedTreeNodes - Expanded sidebar tree node ids.
     * @param {Set<string>} expandedSections - Expanded section panel ids.
     * @returns {void}
     */
    saveNodeContext(
        nodeId: string,
        scrollTop: number,
        expandedTreeNodes: Set<string>,
        expandedSections: Set<string>
    ): void {
        this.lastNodeId = nodeId;
        this.lastScrollTop = scrollTop;
        this.lastExpandedTreeNodes = new Set(expandedTreeNodes);
        this.lastExpandedSections = new Set(expandedSections);
    }

    /**
     * Returns the last saved portfolio node id, or null if none was saved.
     * @returns {string | null} The last portfolio node id.
     */
    getLastNodeId(): string | null {
        return this.lastNodeId;
    }

    /**
     * Records the app id the user opened, so the portfolio can expand the sidebar tree
     * down to that app on return (works for both the table and the top-bar search).
     * @param {string} appId - opened application id.
     * @returns {void}
     */
    setLastAppId(appId: string): void {
        this.lastAppId = appId;
    }

    /**
     * Returns the last opened app id, or null if none was saved.
     * @returns {string | null} The last opened app id.
     */
    getLastAppId(): string | null {
        return this.lastAppId;
    }

    /**
     * Returns the last saved scroll position.
     * @returns {number} The last vertical scroll offset.
     */
    getLastScrollTop(): number {
        return this.lastScrollTop;
    }

    /**
     * Returns a copy of the last saved expanded tree node ids.
     * @returns {Set<string>} Expanded sidebar tree node ids.
     */
    getLastExpandedTreeNodes(): Set<string> {
        return new Set(this.lastExpandedTreeNodes);
    }

    /**
     * Returns a copy of the last saved expanded section ids.
     * @returns {Set<string>} Expanded section panel ids.
     */
    getLastExpandedSections(): Set<string> {
        return new Set(this.lastExpandedSections);
    }

    /**
     * Clears the saved nav context (e.g. on a fresh scope/mode load).
     * @returns {void}
     */
    clearNodeContext(): void {
        this.lastNodeId = null;
        this.lastScrollTop = 0;
        this.lastExpandedTreeNodes = new Set();
        this.lastExpandedSections = new Set();
        this.lastAppId = null;
    }
}
