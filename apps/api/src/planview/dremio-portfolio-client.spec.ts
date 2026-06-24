import DremioPortfolioClient from './dremio-portfolio-client';

// Prevent open-handle warnings from the node:timers/promises sleep import
jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

describe('DremioPortfolioClient', () => {
    let client: DremioPortfolioClient;
    let mockFetch: jest.SpyInstance;

    const mockConfigService = {
        get: jest.fn((key: string) => {
            const config: Record<string, string> = {
                DREMIO_BASE_URL: 'https://dremio.test.com',
                DREMIO_PAT: 'test-token',
                DREMIO_VIEW_PATH:
                    'CAI.ConsolidatedApplicationInventory.dbo.vwAllApplications_Latest',
            };
            return config[key];
        }),
    };

    const mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };

    beforeEach(() => {
        client = new DremioPortfolioClient(mockConfigService as any, mockLogger as any);
        mockFetch = jest.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        mockFetch.mockRestore();
        jest.clearAllMocks();
    });

    it('should throw when DREMIO_BASE_URL is missing', async () => {
        const emptyConfig = { get: jest.fn(() => undefined) };
        const noUrlClient = new DremioPortfolioClient(emptyConfig as any, mockLogger as any);
        await expect(noUrlClient.fetchAllApplications()).rejects.toThrow(/DREMIO_BASE_URL/);
    });

    it('should throw when DREMIO_PAT is missing', async () => {
        const noPATConfig = {
            get: jest.fn((key: string) =>
                key === 'DREMIO_BASE_URL' ? 'https://x.com' : undefined
            ),
        };
        const noPATClient = new DremioPortfolioClient(noPATConfig as any, mockLogger as any);
        await expect(noPATClient.fetchAllApplications()).rejects.toThrow(/DREMIO_PAT/);
    });

    it('should submit SQL, poll job, and page results', async () => {
        const sampleRows = Array.from({ length: 3 }, (_, i) => ({
            InternalID: `id-${i}`,
            ProductName: `App ${i}`,
            CASTKey: `KEY-${i}`,
            Status: 'In Production',
        }));

        // POST /api/v3/sql → returns job id
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-123' }),
        });

        // GET /api/v3/job/job-123 → COMPLETED
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-123', jobState: 'COMPLETED' }),
        });

        // GET /api/v3/job/job-123/results → single page with 3 rows (< PAGE_SIZE)
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ rows: sampleRows }),
        });

        const result = await client.fetchAllApplications();

        expect(result).toHaveLength(3);
        expect(result[0].InternalID).toBe('id-0');
        expect(result[2].ProductName).toBe('App 2');

        // Verify SQL submission
        expect(mockFetch).toHaveBeenCalledTimes(3);
        const sqlCall = mockFetch.mock.calls[0];
        expect(sqlCall[0]).toBe('https://dremio.test.com/api/v3/sql');
        expect(JSON.parse(sqlCall[1].body).sql).toContain('"vwAllApplications_Latest"');
    });

    it('should handle multi-page results', async () => {
        const page1 = Array.from({ length: 500 }, (_, i) => ({
            InternalID: `id-${i}`,
            ProductName: `App ${i}`,
        }));
        const page2 = Array.from({ length: 53 }, (_, i) => ({
            InternalID: `id-${500 + i}`,
            ProductName: `App ${500 + i}`,
        }));

        // POST /sql
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-paged' }),
        });

        // GET /job status → COMPLETED
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-paged', jobState: 'COMPLETED' }),
        });

        // GET /results page 1 (full page → more pages)
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ rows: page1 }),
        });

        // GET /results page 2 (short page → done)
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ rows: page2 }),
        });

        const result = await client.fetchAllApplications();
        expect(result).toHaveLength(553);

        // Verify offset in the second results call
        const resultsCall2 = mockFetch.mock.calls[3];
        expect(resultsCall2[0]).toContain('offset=500');
    });

    it('should poll until job completes', async () => {
        // POST /sql
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-slow' }),
        });

        // First poll: RUNNING
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-slow', jobState: 'RUNNING' }),
        });

        // Second poll: COMPLETED
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-slow', jobState: 'COMPLETED' }),
        });

        // Results
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ rows: [{ InternalID: 'done' }] }),
        });

        const result = await client.fetchAllApplications();
        expect(result).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should throw when job fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: 'job-fail' }),
        });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: 'job-fail',
                jobState: 'FAILED',
                errorMessage: 'Table not found',
            }),
        });

        await expect(client.fetchAllApplications()).rejects.toThrow(
            /job-fail ended with state FAILED.*Table not found/
        );
    });

    it('should throw on HTTP error from Dremio', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => 'Unauthorized',
        });

        await expect(client.fetchAllApplications()).rejects.toThrow(/401/);
    });

    it('should never expose the PAT in error messages', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: async () => 'Forbidden',
        });

        const error = await client.fetchAllApplications().catch((e) => e);
        expect((error as Error).message).not.toContain('test-token');
    });
});
