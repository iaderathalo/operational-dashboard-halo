import { DremioApplicationRecord } from './dremio-portfolio-client';
import PlanviewSyncService from './planview-sync.service';

describe('PlanviewSyncService', () => {
    describe('mapApplication', () => {
        const nowIso = '2026-06-22T12:00:00.000Z';

        it('should map a complete PlanView record to application document', () => {
            const record: DremioApplicationRecord = {
                ProductName: 'Test App',
                CASTKey: 'CAST-001',
                ProductCode: 'PC-001',
                InternalID: 'INT-001',
                Status: 'In Production',
                OpCo: 'Mercer',
                BusinessDeliveryPortfolioName: 'Wealth - Retirement',
                ItOwner: 'Jane Doe',
                ItOwnerEmail: 'jane.doe@test.com',
                PortfolioOwnerName: 'John Smith',
                PortfolioOwnerEmail: 'john.smith@test.com',
                InternalUserCount: 500,
                ExternalUserCount: 100,
                DrTier: 'Tier 1',
                DataDate: '2026-06-20 00:00:00.000',
                OwningOrganization: 'Tech Org',
            };

            const result = PlanviewSyncService.mapApplication(record, nowIso);

            expect(result.name).toBe('Test App');
            expect(result.shortCode).toBe('CAST-001');
            expect(result.planviewInternalId).toBe('INT-001');
            expect(result.castKey).toBe('CAST-001');
            expect(result.environment).toBe('PRODUCTION');
            expect(result.tier).toBe(2); // Tier 1 → priority 2
            expect(result.businessUnit).toBe('Wealth - Retirement');
            expect(result.currentUserCount).toBe(600);
            expect(result.itOwner).toBe('Jane Doe');
            expect(result.itOwnerEmail).toBe('jane.doe@test.com');
            expect(result.opCo).toBe('Mercer');
            expect(result.teamId).toBe('tech-org');
            expect(result.sourceSystem).toBe('PlanView EA');
        });

        it('should use ProductCode as shortCode when CASTKey is missing', () => {
            const record: DremioApplicationRecord = {
                ProductName: 'No CAST App',
                ProductCode: 'PC-002',
                InternalID: 'INT-002',
                Status: 'In Development',
            };

            const result = PlanviewSyncService.mapApplication(record, nowIso);

            expect(result.shortCode).toBe('PC-002');
            expect(result.castKey).toBeNull();
            expect(result.environment).toBe('DEVELOPMENT');
        });

        it('should handle null/undefined fields gracefully', () => {
            const record: DremioApplicationRecord = {
                ProductName: 'Minimal App',
                InternalID: 'INT-003',
                Status: 'In Production',
            };

            const result = PlanviewSyncService.mapApplication(record, nowIso);

            expect(result.name).toBe('Minimal App');
            expect(result.shortCode).toBeUndefined();
            expect(result.businessUnit).toBe('Unknown');
            expect(result.itOwner).toBeNull();
            expect(result.hosting).toBeNull();
            expect(result.internalUserCount).toBe(0);
            expect(result.externalUserCount).toBe(0);
        });

        it('should parse DrTier correctly', () => {
            const tiers = [
                { input: 'Tier 0', expected: 1 },
                { input: 'Tier 1', expected: 2 },
                { input: 'Tier 2', expected: 3 },
                { input: 'Tier 3', expected: 4 },
                { input: '', expected: 4 },
                { input: undefined, expected: 4 },
            ];

            tiers.forEach(({ input, expected }) => {
                const record: DremioApplicationRecord = {
                    ProductName: 'Tier Test',
                    InternalID: 'T',
                    Status: 'In Production',
                    DrTier: input,
                };
                expect(PlanviewSyncService.mapApplication(record, nowIso).tier).toBe(expected);
            });
        });
    });

    describe('upsert preserves Datadog enrichment', () => {
        let service: PlanviewSyncService;
        let mockCollection: any;
        let mockBulkWrite: jest.Mock;

        const mockDremioClient = {
            fetchAllApplications: jest.fn(),
        };

        const mockConfigService = {
            get: jest.fn((key: string) => {
                const config: Record<string, string> = {
                    USE_REAL_PLANVIEW: 'true',
                    PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY: 'false',
                    API_MONGODB_API_DB_URL: 'mongodb://localhost:27018/test',
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
            mockBulkWrite = jest.fn().mockResolvedValue({
                upsertedCount: 1,
                modifiedCount: 0,
            });

            mockCollection = {
                createIndex: jest.fn().mockResolvedValue('planviewInternalId_1'),
                bulkWrite: mockBulkWrite,
                countDocuments: jest.fn().mockResolvedValue(10),
                updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
            };

            service = new PlanviewSyncService(
                mockDremioClient as any,
                mockConfigService as any,
                mockLogger as any
            );

            // Mock the MongoRepository's getDatabase method
            jest.spyOn(service as any, 'getDatabase').mockResolvedValue({
                collection: jest.fn().mockReturnValue(mockCollection),
            });
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        it('should use $set (not $replaceRoot) to preserve Datadog fields', async () => {
            const records: DremioApplicationRecord[] = [
                {
                    ProductName: 'Enriched App',
                    CASTKey: 'CAST-ENRICHED',
                    InternalID: 'INT-ENRICHED',
                    Status: 'In Production',
                    OpCo: 'MMC',
                },
            ];

            mockDremioClient.fetchAllApplications.mockResolvedValue(records);

            await service.syncAll();

            expect(mockBulkWrite).toHaveBeenCalledTimes(1);
            const ops = mockBulkWrite.mock.calls[0][0];
            expect(ops).toHaveLength(1);

            const op = ops[0].updateOne;
            // Filter by planviewInternalId
            expect(op.filter).toEqual({ planviewInternalId: 'INT-ENRICHED' });
            // Uses $set (preserves unmentioned fields like healthStatus, uptime30d)
            expect(op.update.$set).toBeDefined();
            expect(op.update.$set.name).toBe('Enriched App');
            expect(op.update.$set.planviewInternalId).toBe('INT-ENRICHED');
            expect(op.update.$set.active).toBe(true);
            expect(op.update.$set.lastSeenInSourceAt).toBeDefined();
            // Does NOT have $replaceRoot or full replacement
            expect(op.update.$replaceRoot).toBeUndefined();
            // $unset clears removedFromSourceAt on reactivation
            expect(op.update.$unset).toEqual({ removedFromSourceAt: '' });
            // Datadog fields are NOT in $set (so they persist on existing docs)
            expect(op.update.$set.healthStatus).toBeUndefined();
            expect(op.update.$set.uptime30d).toBeUndefined();
            expect(op.update.$set.monitors).toBeUndefined();
            expect(op.update.$set.lastSyncAt).toBeUndefined();
            expect(op.update.$set.resolutionPath).toBeUndefined();
            // $setOnInsert sets createdAt only on new docs
            expect(op.update.$setOnInsert.createdAt).toBeDefined();
            // Upsert flag
            expect(op.upsert).toBe(true);
        });

        it('should only process active records with required fields', async () => {
            const records: DremioApplicationRecord[] = [
                // Active + all keys → included
                { ProductName: 'Good', CASTKey: 'K1', InternalID: 'I1', Status: 'In Production' },
                // Inactive → excluded
                { ProductName: 'Retired', CASTKey: 'K2', InternalID: 'I2', Status: 'Retired' },
                // Missing ProductName → excluded
                { CASTKey: 'K3', InternalID: 'I3', Status: 'In Production' },
                // Missing InternalID → excluded
                { ProductName: 'NoID', CASTKey: 'K4', Status: 'In Development' },
                // Active with ProductCode instead of CASTKey → included
                {
                    ProductName: 'PCApp',
                    ProductCode: 'PC1',
                    InternalID: 'I5',
                    Status: 'In Development',
                },
            ];

            mockDremioClient.fetchAllApplications.mockResolvedValue(records);

            const summary = await service.syncAll();

            expect(summary.totalFetched).toBe(5);
            expect(summary.activeFiltered).toBe(2);
            expect(summary.source).toBe('dremio');

            const ops = mockBulkWrite.mock.calls[0][0];
            expect(ops).toHaveLength(2);
            expect(ops[0].updateOne.update.$set.planviewInternalId).toBe('I1');
            expect(ops[1].updateOne.update.$set.planviewInternalId).toBe('I5');
        });

        it('should use file source when USE_REAL_PLANVIEW is false', async () => {
            const fileService = new PlanviewSyncService(
                mockDremioClient as any,
                {
                    get: jest.fn((key: string) => {
                        const config: Record<string, string> = {
                            USE_REAL_PLANVIEW: 'false',
                            PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY: 'false',
                            API_MONGODB_API_DB_URL: 'mongodb://localhost:27018/test',
                        };
                        return config[key];
                    }),
                } as any,
                mockLogger as any
            );

            jest.spyOn(fileService as any, 'getDatabase').mockResolvedValue({
                collection: jest.fn().mockReturnValue(mockCollection),
            });

            // Mock the file read
            jest.spyOn(fileService as any, 'loadFromFile').mockResolvedValue([
                {
                    ProductName: 'File App',
                    CASTKey: 'FK',
                    InternalID: 'FI',
                    Status: 'In Production',
                },
            ]);

            const summary = await fileService.syncAll();

            expect(summary.source).toBe('file');
            expect(summary.activeFiltered).toBe(1);
            expect(mockDremioClient.fetchAllApplications).not.toHaveBeenCalled();
        });
    });

    describe('reconciliation of removed apps', () => {
        let service: PlanviewSyncService;
        let mockCollection: any;
        let mockUpdateMany: jest.Mock;

        const mockDremioClient = {
            fetchAllApplications: jest.fn(),
        };

        const mockConfigService = {
            get: jest.fn((key: string) => {
                const config: Record<string, string> = {
                    USE_REAL_PLANVIEW: 'true',
                    PREFIX_MONGO_COLLECTION_WITH_PROJECT_KEY: 'false',
                    API_MONGODB_API_DB_URL: 'mongodb://localhost:27018/test',
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
            mockUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });

            mockCollection = {
                createIndex: jest.fn().mockResolvedValue('ok'),
                bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 3, modifiedCount: 0 }),
                countDocuments: jest.fn().mockResolvedValue(5),
                updateMany: mockUpdateMany,
            };

            service = new PlanviewSyncService(
                mockDremioClient as any,
                mockConfigService as any,
                mockLogger as any
            );

            jest.spyOn(service as any, 'getDatabase').mockResolvedValue({
                collection: jest.fn().mockReturnValue(mockCollection),
            });
        });

        afterEach(() => {
            jest.clearAllMocks();
        });

        it('should deactivate PlanView apps not seen in the current fetch', async () => {
            const records: DremioApplicationRecord[] = [
                { ProductName: 'A', CASTKey: 'K1', InternalID: 'I1', Status: 'In Production' },
                { ProductName: 'B', CASTKey: 'K2', InternalID: 'I2', Status: 'In Production' },
                { ProductName: 'C', CASTKey: 'K3', InternalID: 'I3', Status: 'In Production' },
            ];

            mockDremioClient.fetchAllApplications.mockResolvedValue(records);

            const summary = await service.syncAll();

            expect(summary.deactivated).toBe(2);
            expect(mockUpdateMany).toHaveBeenCalledWith(
                { sourceSystem: 'PlanView EA', lastSeenInSourceAt: { $ne: expect.any(String) } },
                {
                    $set: {
                        active: false,
                        removedFromSourceAt: expect.any(String),
                        lifecycleStatus: 'Removed from source',
                    },
                }
            );
        });

        it('should preserve Datadog-enriched fields during deactivation', async () => {
            const records: DremioApplicationRecord[] = [
                { ProductName: 'A', CASTKey: 'K1', InternalID: 'I1', Status: 'In Production' },
                { ProductName: 'B', CASTKey: 'K2', InternalID: 'I2', Status: 'In Production' },
                { ProductName: 'C', CASTKey: 'K3', InternalID: 'I3', Status: 'In Production' },
            ];

            mockDremioClient.fetchAllApplications.mockResolvedValue(records);
            await service.syncAll();

            // The $set in updateMany should NOT contain Datadog fields
            const updateCall = mockUpdateMany.mock.calls[0];
            const setFields = Object.keys(updateCall[1].$set);
            expect(setFields).not.toContain('healthStatus');
            expect(setFields).not.toContain('uptime30d');
            expect(setFields).not.toContain('monitors');
            expect(setFields).not.toContain('lastSyncAt');
            expect(setFields).not.toContain('resolutionPath');
        });

        it('should skip deactivation when fetch returns 0 records (guard)', async () => {
            mockDremioClient.fetchAllApplications.mockResolvedValue([]);

            const summary = await service.syncAll();

            expect(summary.deactivated).toBe(0);
            expect(mockUpdateMany).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('0 records'));
        });

        it('should skip deactivation when fetch is suspiciously small (guard)', async () => {
            // countDocuments returns 5 active, but only 2 fetched (< 50% threshold)
            mockCollection.countDocuments.mockResolvedValue(100);
            const records: DremioApplicationRecord[] = [
                { ProductName: 'A', CASTKey: 'K1', InternalID: 'I1', Status: 'In Production' },
                { ProductName: 'B', CASTKey: 'K2', InternalID: 'I2', Status: 'In Production' },
            ];

            mockDremioClient.fetchAllApplications.mockResolvedValue(records);

            const summary = await service.syncAll();

            expect(summary.deactivated).toBe(0);
            expect(mockUpdateMany).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('suspiciously low'),
                expect.objectContaining({ fetchedActiveCount: 2, currentActiveCount: 100 })
            );
        });

        it('should reactivate a returning app (active: true, unset removedFromSourceAt)', async () => {
            const records: DremioApplicationRecord[] = [
                {
                    ProductName: 'Returning',
                    CASTKey: 'KR',
                    InternalID: 'IR',
                    Status: 'In Production',
                },
                { ProductName: 'B', CASTKey: 'K2', InternalID: 'I2', Status: 'In Production' },
                { ProductName: 'C', CASTKey: 'K3', InternalID: 'I3', Status: 'In Production' },
            ];

            mockDremioClient.fetchAllApplications.mockResolvedValue(records);
            await service.syncAll();

            const ops = mockCollection.bulkWrite.mock.calls[0][0];
            const returningOp = ops[0].updateOne;

            // Should set active: true
            expect(returningOp.update.$set.active).toBe(true);
            // Should unset removedFromSourceAt
            expect(returningOp.update.$unset).toEqual({ removedFromSourceAt: '' });
        });
    });
});
