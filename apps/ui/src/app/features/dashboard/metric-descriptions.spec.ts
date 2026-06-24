import { formatMetricTooltip, METRIC_DESCRIPTIONS, MetricKey } from './metric-descriptions';

describe('metric-descriptions', () => {
    describe('METRIC_DESCRIPTIONS', () => {
        const expectedKeys: MetricKey[] = [
            'health',
            'uptime',
            'maturity',
            'burnRate',
            'uptimeDetail',
            'errorBudget',
        ];

        it('should have an entry for every expected key', () => {
            expectedKeys.forEach((key) => {
                expect(METRIC_DESCRIPTIONS[key]).toBeDefined();
            });
        });

        it('should have non-empty label, howCalculated, source and meaning for every entry', () => {
            expectedKeys.forEach((key) => {
                const desc = METRIC_DESCRIPTIONS[key];
                expect(desc.label.length).toBeGreaterThan(0);
                expect(desc.howCalculated.length).toBeGreaterThan(0);
                expect(desc.source.length).toBeGreaterThan(0);
                expect(desc.meaning.length).toBeGreaterThan(0);
            });
        });
    });

    describe('formatMetricTooltip', () => {
        it('should join howCalculated, source and meaning with " · "', () => {
            const desc = {
                label: 'Test',
                howCalculated: 'How it is calculated',
                source: 'Live · Datadog',
                meaning: 'What it means',
            };
            const result = formatMetricTooltip(desc);
            expect(result).toBe('How it is calculated · Live · Datadog · What it means');
        });

        it('should produce a string containing all three triad fields', () => {
            const desc = METRIC_DESCRIPTIONS.maturity;
            const result = formatMetricTooltip(desc);
            expect(result).toContain(desc.howCalculated);
            expect(result).toContain(desc.source);
            expect(result).toContain(desc.meaning);
        });

        it('should produce a non-empty string for every METRIC_DESCRIPTIONS entry', () => {
            const keys: MetricKey[] = [
                'health',
                'uptime',
                'maturity',
                'burnRate',
                'uptimeDetail',
                'errorBudget',
            ];
            keys.forEach((key) => {
                expect(formatMetricTooltip(METRIC_DESCRIPTIONS[key]).length).toBeGreaterThan(0);
            });
        });
    });
});
