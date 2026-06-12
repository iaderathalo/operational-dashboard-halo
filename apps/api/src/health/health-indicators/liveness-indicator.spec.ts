import { HealthIndicatorResult } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';

import LivenessIndicator from './liveness-indicator';

describe('LivenessIndicator', () => {
    let livenessIndicator: LivenessIndicator;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [LivenessIndicator],
        }).compile();

        livenessIndicator = module.get<LivenessIndicator>(LivenessIndicator);
    });

    it('should be defined', () => {
        expect(livenessIndicator).toBeDefined();
    });

    describe('check', () => {
        it('should invoke the getStatus method and return the result', () => {
            // Linting rule disabled because 'getStatus' is a protected function
            // so isn't visible to this file. Use of 'any' avoids TypeScript erroring.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getStatusSpy = jest.spyOn(livenessIndicator as any, 'getStatus');
            const mockHealthIndicatorResult = mock<HealthIndicatorResult>();
            getStatusSpy.mockReturnValueOnce(mockHealthIndicatorResult);

            const result = livenessIndicator.check('test');

            expect(result).toEqual(mockHealthIndicatorResult);
            expect(getStatusSpy).toHaveBeenCalledTimes(1);
            expect(getStatusSpy).toHaveBeenCalledWith('test', true);
        });
    });
});
