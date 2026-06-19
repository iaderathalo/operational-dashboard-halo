import { Logger } from '@mmctech-artifactory/polaris-logger';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';

import { HealthSnapshot } from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardService from './dashboard.service';
import { PortfolioAppContext } from './portfolio.model';
import { PortfolioRepository } from './portfolio.repository';
import ApplicationsService from '../applications/applications.service';
import { HealthSnapshotRepository } from '../health-snapshots/health-snapshot.repository';

const APP_ID = '1234567890abcdefab000060';

const sampleSnapshots: HealthSnapshot[] = [
    {
        applicationId: APP_ID,
        status: 'GREEN',
        uptimePct: 99.9,
        datadogMapped: true,
        monitorCount: 4,
        resolutionPath: 'primary',
        recordedAt: '2026-06-16T12:00:00.000Z',
    },
    {
        applicationId: APP_ID,
        status: 'AMBER',
        uptimePct: 98.1,
        datadogMapped: true,
        monitorCount: 4,
        resolutionPath: 'primary',
        recordedAt: '2026-06-15T12:00:00.000Z',
    },
];

describe('DashboardService', () => {
    let service: DashboardService;
    let portfolioRepository: MockProxy<PortfolioRepository>;
    let healthSnapshots: MockProxy<HealthSnapshotRepository>;
    let applicationsService: MockProxy<ApplicationsService>;
    let logger: MockProxy<Logger>;

    beforeEach(async () => {
        portfolioRepository = mock<PortfolioRepository>();
        healthSnapshots = mock<HealthSnapshotRepository>();
        applicationsService = mock<ApplicationsService>();
        logger = mock<Logger>();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardService,
                { provide: ApplicationsService, useValue: applicationsService },
                { provide: 'PortfolioRepository', useValue: portfolioRepository },
                { provide: 'HealthSnapshotRepository', useValue: healthSnapshots },
                { provide: Logger, useValue: logger },
            ],
        }).compile();

        service = module.get<DashboardService>(DashboardService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getHealthHistory', () => {
        const context = { app: { id: APP_ID } } as unknown as PortfolioAppContext;

        it('returns the snapshot series for an in-scope application', async () => {
            portfolioRepository.getAppContext.mockResolvedValue(context);
            healthSnapshots.findRecentByApplicationId.mockResolvedValue(sampleSnapshots);

            const result = await service.getHealthHistory(APP_ID, 'user@example.com');

            expect(result).toEqual({ applicationId: APP_ID, points: sampleSnapshots });
            expect(portfolioRepository.getAppContext).toHaveBeenCalledWith(
                APP_ID,
                'user@example.com'
            );
        });

        it('scopes through the portfolio and 404s an unknown or out-of-scope app', async () => {
            portfolioRepository.getAppContext.mockResolvedValue(null);

            await expect(service.getHealthHistory(APP_ID)).rejects.toThrow(
                new NotFoundException(`Dashboard application [${APP_ID}] not found`)
            );
            expect(healthSnapshots.findRecentByApplicationId).not.toHaveBeenCalled();
        });

        it('defaults the limit when none is supplied', async () => {
            portfolioRepository.getAppContext.mockResolvedValue(context);
            healthSnapshots.findRecentByApplicationId.mockResolvedValue([]);

            await service.getHealthHistory(APP_ID);

            expect(healthSnapshots.findRecentByApplicationId).toHaveBeenCalledWith(APP_ID, 500);
        });

        it('caps an oversized limit to the maximum', async () => {
            portfolioRepository.getAppContext.mockResolvedValue(context);
            healthSnapshots.findRecentByApplicationId.mockResolvedValue([]);

            await service.getHealthHistory(APP_ID, undefined, 999999);

            expect(healthSnapshots.findRecentByApplicationId).toHaveBeenCalledWith(APP_ID, 2000);
        });

        it('falls back to the default on a non-positive limit', async () => {
            portfolioRepository.getAppContext.mockResolvedValue(context);
            healthSnapshots.findRecentByApplicationId.mockResolvedValue([]);

            await service.getHealthHistory(APP_ID, undefined, 0);

            expect(healthSnapshots.findRecentByApplicationId).toHaveBeenCalledWith(APP_ID, 500);
        });
    });
});
