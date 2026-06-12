import { ExecutionContext, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mock, MockProxy } from 'jest-mock-extended';

import { isWhiteListedController } from './allowControllerWithNoBearer';

jest.mock('@mmctech-artifactory/polaris-logger');

describe('allowControllerWithNoBearer', () => {
    describe('isWhiteListedController', () => {
        let mockExecutionContext: MockProxy<ExecutionContext>;
        let mockReflector: MockProxy<Reflector>;

        const mockGetClassResult = mock<Type>();
        // Linting rule disabled because Function is the correct return type of getHandler.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const mockGetHandlerResult = mock<Function>();

        beforeEach(() => {
            mockExecutionContext = mock<ExecutionContext>();
            mockReflector = mock<Reflector>();

            mockExecutionContext.getClass.mockReturnValueOnce(mockGetClassResult);
            mockExecutionContext.getHandler.mockReturnValueOnce(mockGetHandlerResult);
        });

        it('should invoke the reflector get function with the expected parameters', () => {
            const reflectorSpy = jest.spyOn(mockReflector, 'get');
            isWhiteListedController(mockExecutionContext, mockReflector);

            expect(reflectorSpy).toHaveBeenCalledTimes(2);
            expect(reflectorSpy).toHaveBeenNthCalledWith(
                1,
                'WhitelistedAuthController',
                mockGetClassResult
            );
            expect(reflectorSpy).toHaveBeenNthCalledWith(
                2,
                'WhitelistedAuthController',
                mockGetHandlerResult
            );
        });

        it('should return true when the class is decorated', () => {
            // true for class, false for function
            mockReflector.get.mockReturnValueOnce(true);
            mockReflector.get.mockReturnValueOnce(false);
            const result = isWhiteListedController(mockExecutionContext, mockReflector);

            expect(result).toBe(true);
        });

        it('should return true when the function is decorated', () => {
            // false for class, true for function
            mockReflector.get.mockReturnValueOnce(false);
            mockReflector.get.mockReturnValueOnce(true);
            const result = isWhiteListedController(mockExecutionContext, mockReflector);

            expect(result).toBe(true);
        });

        it('should return false when neither the class or function is decorated', () => {
            // false for class, false for function
            mockReflector.get.mockReturnValueOnce(false);
            mockReflector.get.mockReturnValueOnce(false);
            const result = isWhiteListedController(mockExecutionContext, mockReflector);

            expect(result).toBe(false);
        });
    });
});
