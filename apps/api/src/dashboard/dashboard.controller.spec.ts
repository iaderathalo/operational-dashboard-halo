import { Test, TestingModule } from '@nestjs/testing';
import * as tsm from 'ts-mockito';

import { HealthHistoryResponse } from '@operational-dashboard/shared-api-model/model/dashboard';

import DashboardController from './dashboard.controller';
import DashboardService from './dashboard.service';

const mockedService = tsm.mock(DashboardService);
const mockedServiceInstance = tsm.instance(mockedService);

describe('With DashboardController', () => {
    let controller: DashboardController;

    beforeEach(async () => {
        tsm.reset(mockedService);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DashboardController],
            providers: [
                {
                    provide: DashboardService,
                    useValue: mockedServiceInstance,
                },
            ],
        }).compile();

        controller = module.get<DashboardController>(DashboardController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
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
});
