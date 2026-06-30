import { PortfolioApp } from './models/portfolio.model';

/**
 * Ordered signal keys for the 5-segment maturity indicator.
 * Position maps directly to criterion (not rank).
 */
export const MATURITY_SIGNAL_KEY_ORDER: ReadonlyArray<
    keyof NonNullable<PortfolioApp['maturity']>['signals']
> = ['mapped', 'hasMonitor', 'hasSLO', 'sloPassing', 'hasOwner'];

/** How each signal is calculated — used as the per-block tooltip body. */
export const MATURITY_SIGNAL_CALC: Record<string, string> = {
    mapped: 'Linked to a Datadog service (the app carries a service tag).',
    hasMonitor: 'At least one Datadog monitor watches that service.',
    hasSLO: 'A 30-day SLO target is defined for the service.',
    sloPassing: 'The 30-day uptime is meeting that SLO target.',
    hasOwner: 'An IT, portfolio, or business owner is recorded.',
};

/** Human-readable label per signal. */
export const MATURITY_SIGNAL_LABELS: Record<string, string> = {
    mapped: 'Mapped to Datadog',
    hasMonitor: 'Has monitors',
    hasSLO: 'Has SLO',
    sloPassing: 'SLO passing',
    hasOwner: 'Has owner',
};

/**
 * Overall maturity tooltip shown on the "X/5" score label: the score, the scoring rule,
 * and the data source. Per-signal detail lives on each indicator block.
 * @param {{ score: number; max: number } | null | undefined} maturity - maturity score or null/undefined
 * @returns {string} two-line score summary
 */
export function buildMaturityScoreTooltip(
    maturity: { score: number; max: number } | null | undefined
): string {
    const header = maturity
        ? `Maturity ${maturity.score}/${maturity.max} · 1 point per signal met`
        : 'Maturity · not scored yet';
    return `${header}\nSource: Datadog + PlanView`;
}

/**
 * Builds 5 segment descriptors for the maturity indicator. Each segment maps to a
 * specific signal in MATURITY_SIGNAL_KEY_ORDER so position = criterion, not rank.
 * The `cls` drives the fill; `tip` is that block's own tooltip.
 * @param {Record<string, boolean> | null | undefined} signals - maturity signals map
 * @returns {{ cls: string; tip: string }[]} 5 segment descriptors
 */
export function buildMaturitySegments(
    signals: Record<string, boolean> | null | undefined
): { cls: string; tip: string }[] {
    return MATURITY_SIGNAL_KEY_ORDER.map((key) => {
        const met = signals ? Boolean(signals[key]) : false;
        const label = MATURITY_SIGNAL_LABELS[key] ?? key;
        const calc = MATURITY_SIGNAL_CALC[key] ?? '';
        return {
            cls: met ? 'mat-filled' : 'mat-empty',
            tip: `${met ? '✓' : '✗'} ${label}\n${calc}`,
        };
    });
}
