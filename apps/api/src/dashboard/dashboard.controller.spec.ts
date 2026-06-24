import { Test, TestingModule } from '@nestjs/testing';
import * as tsm from 'ts-mockito';

import {
    DigestSummary,
    HealthHistoryResponse,
    RecommendationResult,
    SnapshotMetadata,
} from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardController from './dashboard.controller';
import DashboardService from './dashboard.service';
import { PortfolioNode } from './portfolio.model';
import RecommendationsService from '../recommendations/recommendations.service';

const mockedService = tsm.mock(DashboardService);
const mockedServiceInstance = tsm.instance(mockedService);

const mockedRecommendationsService = tsm.mock(RecommendationsService);
const mockedRecommendationsServiceInstance = tsm.instance(mockedRecommendationsService);

describe('With DashboardController', () => {
    let controller: DashboardController;

    beforeEach(async () => {
        tsm.reset(mockedService);
        tsm.reset(mockedRecommendationsService);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DashboardController],
            providers: [
                {
                    provide: DashboardService,
                    useValue: mockedServiceInstance,
                },
                {
                    provide: RecommendationsService,
                    useValue: mockedRecommendationsServiceInstance,
                },
            ],
        }).compile();

        controller = module.get<DashboardController>(DashboardController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('getDigest / getSnapshot', () => {
        const digest = { scope: 'mine' } as DigestSummary;
        const snapshot = {
            portfolio: { id: 'application-portfolio' } as PortfolioNode,
            metadata: { scope: 'mine' } as SnapshotMetadata,
        };

        it('delegates getDigest with the scoped email when scope=mine', async () => {
            const request = { user: { email: 'user@example.com' } };
            tsm.when(mockedService.getDigest('user@example.com')).thenReturn(
                Promise.resolve(digest)
            );

            const result = await controller.getDigest(request, 'mine');

            expect(result).toBe(digest);
            tsm.verify(mockedService.getDigest('user@example.com')).once();
        });

        it("only ever uses the caller's own email — an unscoped snapshot passes undefined", async () => {
            const request = { user: { email: 'user@example.com' } };
            tsm.when(mockedService.getSnapshot(undefined)).thenReturn(Promise.resolve(snapshot));

            const result = await controller.getSnapshot(request);

            expect(result).toBe(snapshot);
            tsm.verify(mockedService.getSnapshot(undefined)).once();
            tsm.verify(mockedService.getSnapshot('user@example.com')).never();
        });

        it("passes the caller's own email to a mine-scoped snapshot", async () => {
            const request = { user: { email: 'user@example.com' } };
            tsm.when(mockedService.getSnapshot('user@example.com')).thenReturn(
                Promise.resolve(snapshot)
            );

            await controller.getSnapshot(request, 'mine');

            tsm.verify(mockedService.getSnapshot('user@example.com')).once();
        });
    });

    describe('getAppHealthHistory', () => {
        const appId = '1234567890abcdefab000060';
        const response: HealthHistoryResponse = { applicationId: appId, points: [] };

        it('passes the scoped email and parsed limit when scope=mine', async () => {
            const request = { user: { email: 'user@example.com' } };
            tsm.when(mockedService.getHealthHistory(appId, 'user@example.com', 50)).thenReturn(
                Promise.resolve(response)
            );

            const result = await controller.getAppHealthHistory(request, appId, '50', 'mine');

            expect(result).toEqual(response);
            tsm.verify(mockedService.getHealthHistory(appId, 'user@example.com', 50)).once();
        });

        it('passes undefined for email and limit when neither is present', async () => {
            const request = {};
            tsm.when(mockedService.getHealthHistory(appId, undefined, undefined)).thenReturn(
                Promise.resolve(response)
            );

            await controller.getAppHealthHistory(request, appId);

            tsm.verify(mockedService.getHealthHistory(appId, undefined, undefined)).once();
        });
    });

    describe('getAppRecommendations', () => {
        const appId = '6a3153464907b47284e92d1c';
        const recommendation = { appId } as RecommendationResult;

        it('passes the scoped email and refresh flag when scope=mine and refresh=1', async () => {
            const request = { user: { email: 'user@example.com' } };
            tsm.when(
                mockedRecommendationsService.getRecommendations(appId, 'user@example.com', true)
            ).thenReturn(Promise.resolve(recommendation));

            const result = await controller.getAppRecommendations(request, appId, '1', 'mine');

            expect(result).toBe(recommendation);
            tsm.verify(
                mockedRecommendationsService.getRecommendations(appId, 'user@example.com', true)
            ).once();
        });

        it('passes undefined email and false refresh when neither query is present', async () => {
            const request = {};
            tsm.when(
                mockedRecommendationsService.getRecommendations(appId, undefined, false)
            ).thenReturn(Promise.resolve(recommendation));

            await controller.getAppRecommendations(request, appId);

            tsm.verify(
                mockedRecommendationsService.getRecommendations(appId, undefined, false)
            ).once();
        });
    });
});
