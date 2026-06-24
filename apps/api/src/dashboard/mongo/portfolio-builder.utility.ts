import { StoredApplication } from './mongo-portfolio.types';

// eslint-disable-next-line import/prefer-default-export
export class PortfolioBuilderUtility {
    /**
     *
     * @param application
     */
    static opCoOf(application: StoredApplication): string {
        return (application.opCo || 'Unassigned').trim() || 'Unassigned';
    }

    /**
     *
     * @param application
     */
    static businessUnitOf(application: StoredApplication): string {
        const p = (
            application.businessDeliveryPortfolio ||
            application.businessUnit ||
            'Unassigned'
        ).trim();
        const i = p.indexOf(' - ');
        return (i === -1 ? p : p.slice(0, i).trim()) || 'Unassigned';
    }

    /**
     *
     * @param application
     */
    static lobOf(application: StoredApplication): string {
        const p = (
            application.businessDeliveryPortfolio ||
            application.businessUnit ||
            'Unassigned'
        ).trim();
        const i = p.indexOf(' - ');
        return i === -1 ? 'General' : p.slice(i + 3).trim();
    }

    /**
     *
     * @param applications
     * @param selector
     * @param fallback
     */
    static mostCommon(
        applications: StoredApplication[],
        selector: (application: StoredApplication) => string | null | undefined,
        fallback: string
    ): string {
        const counts = applications.reduce((map, app) => {
            const v = (selector(app) || '').trim();
            if (v) map.set(v, (map.get(v) || 0) + 1);
            return map;
        }, new Map<string, number>());
        let best = fallback;
        let bestCount = 0;
        counts.forEach((n, v) => {
            if (n > bestCount) {
                best = v;
                bestCount = n;
            }
        });
        return best;
    }

    /**
     *
     * @param applications
     * @param keySelector
     */
    static groupApplications(
        applications: StoredApplication[],
        keySelector: (application: StoredApplication) => string
    ): Map<string, StoredApplication[]> {
        return applications.reduce((map, app) => {
            const key = keySelector(app);
            const bucket = map.get(key) || [];
            bucket.push(app);
            map.set(key, bucket);
            return map;
        }, new Map<string, StoredApplication[]>());
    }

    /**
     *
     * @param application
     */
    static computeMaturity(application: StoredApplication) {
        const {
            datadogMapped,
            monitors,
            uptime30d,
            slaTarget,
            itOwner,
            portfolioOwnerName,
            businessOwner,
        } = application;
        const signals = {
            mapped: datadogMapped ?? false,
            hasMonitor: (monitors?.length ?? 0) > 0,
            hasSLO: uptime30d != null,
            sloPassing: uptime30d != null && slaTarget != null && uptime30d >= slaTarget,
            hasOwner: Boolean(itOwner || portfolioOwnerName || businessOwner),
        };
        const score = Object.values(signals).filter(Boolean).length;
        return { score, max: Object.keys(signals).length, signals };
    }

    /**
     *
     * @param rate
     */
    private static getBandForRate(rate: number): 'healthy' | 'fast-burn' | 'at-risk' {
        if (rate < 1) return 'healthy';
        return rate <= 2 ? 'fast-burn' : 'at-risk';
    }

    /**
     *
     * @param application
     */
    static computeBurnRate(application: StoredApplication): {
        rate: number | null;
        band: 'healthy' | 'fast-burn' | 'at-risk' | 'unknown';
    } {
        const { uptime30d, slaTarget } = application;
        const allowedBudget = slaTarget != null ? 100 - slaTarget : null;
        if (uptime30d == null || slaTarget == null || allowedBudget == null || allowedBudget <= 0) {
            return { rate: null, band: 'unknown' };
        }
        const consumed = Math.max(0, 100 - uptime30d);
        const rate = consumed / allowedBudget;
        const band = this.getBandForRate(rate);
        return { rate, band };
    }

    /**
     *
     * @param value
     */
    static slugify(value: string): string {
        return value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    /**
     *
     * @param application
     */
    static getHealthStatus(
        application: StoredApplication
    ): 'green' | 'amber' | 'red' | 'undefined' {
        if (application.datadogMapped && application.healthStatus) {
            return application.healthStatus.toLowerCase() as 'green' | 'amber' | 'red';
        }
        return 'undefined';
    }

    /**
     *
     * @param application
     */
    static getBurnRateBand(
        application: StoredApplication
    ): 'healthy' | 'fast-burn' | 'at-risk' | 'unknown' {
        return this.computeBurnRate(application).band;
    }
}
