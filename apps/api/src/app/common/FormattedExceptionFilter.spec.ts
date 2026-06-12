/* eslint-disable jest/expect-expect */
import {
    ArgumentsHost,
    BadGatewayException,
    HttpException,
    HttpStatus,
    InternalServerErrorException,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { HttpArgumentsHost } from '@nestjs/common/interfaces';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { mock } from 'jest-mock-extended';

import FormattedExceptionFilter from './FormattedExceptionFilter';

/**
 * Checks that the test exception is correctly marshalled into a response
 * @param {FormattedExceptionFilter} toTest The class under test in the unit tests.
 * @param {HttpException} testException The exception to pass to the class-under-test's catch function.
 * @param {number} statusCode The status code that is expected to be passed to the express Response object.
 * @param {object} expectedResponse The response that is expected to be passed as the body to the express Response object.
 * @param {string} expectedResponse.detail The additional response as the body of the exception.
 * @param {string} expectedResponse.instance the path or resource responsible for the error.
 * @param {string} expectedResponse.status The HTTP response status.
 * @param {string} expectedResponse.title The title of the HTTP error.
 * @param {string} expectedResponse.type Type of the HTTP Exception.
 */
function checkExceptionResponseIsExpected(
    toTest: FormattedExceptionFilter,
    testException: HttpException,
    statusCode: number,
    expectedResponse: {
        detail: string;
        instance: string;
        status: string;
        title: string;
        type: string;
    }
) {
    const request = mock<Request>({ url: 'a test url value' });
    const response = mock<Response>();
    const httpArgumentsHost = mock<HttpArgumentsHost>();
    httpArgumentsHost.getRequest.mockReturnValueOnce(request);
    httpArgumentsHost.getResponse.mockReturnValueOnce(response);
    const argumentsHost = mock<ArgumentsHost>();
    argumentsHost.switchToHttp.mockReturnValueOnce(httpArgumentsHost);

    toTest.catch(testException, argumentsHost);

    expect(response.status).toHaveBeenCalledWith(statusCode);
    expect(response.json).toHaveBeenCalledWith(expectedResponse);
}

describe('Exception formatting is to standards', () => {
    let toTest: FormattedExceptionFilter;
    let mockConfigService: jest.Mocked<ConfigService>;

    beforeEach(() => {
        mockConfigService = mock<ConfigService>();
        // Default to feature flag disabled for existing tests
        mockConfigService.get.mockReturnValue('false');
        toTest = new FormattedExceptionFilter(mockConfigService);
    });

    it('Not found exception', () => {
        const testException = new NotFoundException('asdf');
        const expectedResponse = {
            detail: 'asdf',
            instance: 'a test url value',
            status: '404',
            title: 'The requested resource was not found',
            type: '/probs/NotFound',
        };

        checkExceptionResponseIsExpected(
            toTest,
            testException,
            HttpStatus.NOT_FOUND,
            expectedResponse
        );
    });

    it('Bad request exception', () => {
        const testException = new BadRequestException('bbbb bbbb');
        const expectedResponse = {
            detail: 'bbbb bbbb',
            instance: 'a test url value',
            status: '400',
            title: 'Bad request submitted by client',
            type: '/probs/BadRequest',
        };

        checkExceptionResponseIsExpected(
            toTest,
            testException,
            HttpStatus.BAD_REQUEST,
            expectedResponse
        );
    });

    it('Internal server error', () => {
        const testException = new InternalServerErrorException('iiii iiii');
        const expectedResponse = {
            detail: 'iiii iiii',
            instance: 'a test url value',
            status: '500',
            title: 'Application error occurred',
            type: '/probs/ApplicationException',
        };

        checkExceptionResponseIsExpected(
            toTest,
            testException,
            HttpStatus.INTERNAL_SERVER_ERROR,
            expectedResponse
        );
    });

    it('Converts an unhandled exception to a 500', () => {
        // The filter does not have code specifically for
        // a UnauthorizedException. It should convert it to a 500.
        const testException = new BadGatewayException('No more resource');
        const expectedResponse = {
            detail: 'No more resource',
            instance: 'a test url value',
            status: '500',
            title: 'Application error occurred',
            type: '/probs/ApplicationException',
        };

        checkExceptionResponseIsExpected(
            toTest,
            testException,
            HttpStatus.INTERNAL_SERVER_ERROR,
            expectedResponse
        );
    });
});

describe('Feature flag behavior', () => {
    let toTest: FormattedExceptionFilter;
    let mockConfigService: jest.Mocked<ConfigService>;

    beforeEach(() => {
        mockConfigService = mock<ConfigService>();
    });

    it('should initialize with validation error handling disabled when config is false', () => {
        mockConfigService.get.mockReturnValue('false');
        toTest = new FormattedExceptionFilter(mockConfigService);

        expect(mockConfigService.get).toHaveBeenCalledWith(
            'ENABLE_VALIDATION_ERROR_HANDLING',
            'false'
        );
    });

    it('should initialize with validation error handling enabled when config is true', () => {
        mockConfigService.get.mockReturnValue('true');
        toTest = new FormattedExceptionFilter(mockConfigService);

        expect(mockConfigService.get).toHaveBeenCalledWith(
            'ENABLE_VALIDATION_ERROR_HANDLING',
            'false'
        );
    });

    it('should handle validation errors when feature flag is enabled', () => {
        mockConfigService.get.mockReturnValue('true');
        toTest = new FormattedExceptionFilter(mockConfigService);

        const validationResponse = {
            message: ['Delivery group must not be null or empty'],
            error: 'Bad Request',
            statusCode: 400,
        };

        const testException = new BadRequestException(validationResponse);
        const request = mock<Request>({ url: '/test-endpoint' });
        const response = mock<Response>();

        // Fix the response mock to return itself for chaining
        response.status.mockReturnValue(response);

        const httpArgumentsHost = mock<HttpArgumentsHost>();
        httpArgumentsHost.getRequest.mockReturnValueOnce(request);
        httpArgumentsHost.getResponse.mockReturnValueOnce(response);
        const argumentsHost = mock<ArgumentsHost>();
        argumentsHost.switchToHttp.mockReturnValueOnce(httpArgumentsHost);

        toTest.catch(testException, argumentsHost);

        expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(response.json).toHaveBeenCalledWith({
            detail: 'Validation failed',
            instance: '/test-endpoint',
            type: '/probs/ValidationError',
            title: 'Validation error',
            status: HttpStatus.BAD_REQUEST,
            errors: ['Delivery group must not be null or empty'],
        });
    });

    it('should use standard error handling when feature flag is disabled', () => {
        mockConfigService.get.mockReturnValue('false');
        toTest = new FormattedExceptionFilter(mockConfigService);

        const validationResponse = {
            message: ['Delivery group must not be null or empty'],
            error: 'Bad Request',
            statusCode: 400,
        };

        const testException = new BadRequestException(validationResponse);
        const request = mock<Request>({ url: '/test-endpoint' });
        const response = mock<Response>();

        // Fix the response mock to return itself for chaining
        response.status.mockReturnValue(response);

        const httpArgumentsHost = mock<HttpArgumentsHost>();
        httpArgumentsHost.getRequest.mockReturnValueOnce(request);
        httpArgumentsHost.getResponse.mockReturnValueOnce(response);
        const argumentsHost = mock<ArgumentsHost>();
        argumentsHost.switchToHttp.mockReturnValueOnce(httpArgumentsHost);

        toTest.catch(testException, argumentsHost);

        // Should use standard BadRequest handling instead of validation error handling
        expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(response.json).toHaveBeenCalledWith({
            detail: 'Bad Request Exception',
            instance: '/test-endpoint',
            type: '/probs/BadRequest',
            title: 'Bad request submitted by client',
            status: '400',
        });
    });
});
