import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { mock, MockProxy } from 'jest-mock-extended';

import LivenessIndicator from './health-indicators/liveness-indicator';
import HealthController from './health.controller';

describe('HealthController', () => {
    let controller: HealthController;
    let mockHealthCheckService: MockProxy<HealthCheckService>;
    let mockLivenessIndicator: MockProxy<LivenessIndicator>;
    let mockLogger: MockProxy<Logger>;

    beforeEach(async () => {
        mockHealthCheckService = mock<HealthCheckService>();
        mockLivenessIndicator = mock<LivenessIndicator>();
        mockLogger = mock<Logger>();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                {
                    provide: HealthCheckService,
                    useValue: mockHealthCheckService,
                },
                {
                    provide: LivenessIndicator,
                    useValue: mockLivenessIndicator,
                },
                {
                    provide: Logger,
                    useValue: mockLogger,
                },
            ],
        }).compile();

        controller = module.get<HealthController>(HealthController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('check', () => {
        it('should invoke the health indicator check and return undefined when healthy', async () => {
            const healthCheckServiceSpy = jest.spyOn(mockHealthCheckService, 'check');
            const mockHealthCheckResult = mock<HealthCheckResult>();
            healthCheckServiceSpy.mockResolvedValueOnce(mockHealthCheckResult);

            const result = await controller.check();

            expect(healthCheckServiceSpy).toHaveBeenCalledTimes(1);
            expect(healthCheckServiceSpy).toHaveBeenCalledWith(expect.any(Array));
            expect(result).toBeUndefined();
        });

        it('should invoke the health indicator check and throw when unhealthy', async () => {
            const healthCheckServiceSpy = jest.spyOn(mockHealthCheckService, 'check');
            healthCheckServiceSpy.mockRejectedValueOnce(new Error('some test error'));

            await expect(async () => {
                await controller.check();
            }).rejects.toThrow(new ServiceUnavailableException());
        });
    });
});
