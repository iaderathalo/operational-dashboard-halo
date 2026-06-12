/* eslint-disable jsdoc/no-undefined-types */
import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { ErrorTemplate } from './models/ErrorTemplate';
import { ValidationExceptionResponse } from './models/ValidationExceptionResponse';

/**
 * Ensures that error messages are in the format required by the Core API team's API standards.
 */
@Catch(HttpException)
export default class FormattedExceptionFilter implements ExceptionFilter {
    exceptionTemplates: Record<string, ErrorTemplate> = {};

    private readonly validationErrorHandlingEnabled: boolean;

    /**
     * Constructs a new instance of the `FormattedExceptionFilter` class.
     * Initializes the `exceptionTemplates` map with default response templates for various HTTP status codes.
     * @param {ConfigService} configService - The NestJS ConfigService for reading environment variables.
     */
    constructor(private readonly configService: ConfigService) {
        // Initialize feature flag from environment variable, default to false
        this.validationErrorHandlingEnabled =
            this.configService.get<string>('ENABLE_VALIDATION_ERROR_HANDLING', 'false') === 'true';

        this.exceptionTemplates[HttpStatus.INTERNAL_SERVER_ERROR] = {
            type: '/probs/ApplicationException',
            title: 'Application error occurred',
            status: String(HttpStatus.INTERNAL_SERVER_ERROR),
        };

        this.exceptionTemplates[HttpStatus.BAD_REQUEST] = {
            type: '/probs/BadRequest',
            title: 'Bad request submitted by client',
            status: String(HttpStatus.BAD_REQUEST),
        };

        this.exceptionTemplates[HttpStatus.UNAUTHORIZED] = {
            type: '/probs/Unauthorized',
            title: 'Credentials required but not received or invalid',
            status: String(HttpStatus.UNAUTHORIZED),
        };

        this.exceptionTemplates[HttpStatus.FORBIDDEN] = {
            type: '/probs/Forbidden',
            title: 'Credentials received but not appropriate for this action',
            status: String(HttpStatus.FORBIDDEN),
        };

        this.exceptionTemplates[HttpStatus.NOT_FOUND] = {
            type: '/probs/NotFound',
            title: 'The requested resource was not found',
            status: String(HttpStatus.NOT_FOUND),
        };

        this.exceptionTemplates[HttpStatus.CONFLICT] = {
            type: '/probs/Conflict',
            title: 'The request could not be completed due to a conflict with the current state of the target resource.',
            status: String(HttpStatus.CONFLICT),
        };
    }

    /**
     * Handles an exception by formatting the response and sending it to the client.
     * @param {HttpException} exception - The exception to handle.
     * @param {ArgumentsHost} host - An object containing information about the current request and response.
     */
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        Logger.error(exception.getStatus());
        Logger.error(exception.stack);

        // Handle validation errors for BadRequestException only if feature flag is enabled
        if (
            this.validationErrorHandlingEnabled &&
            FormattedExceptionFilter.handleValidationError(exception, request, response)
        ) {
            return;
        }

        const errMessage = this.getErrorPayload(exception, request.url);

        // Parsing the error message status to ensure consistency of response codes with messages.
        response.status(Number.parseInt(errMessage.status, 10));
        response.json(errMessage);
    }

    /**
     * Handles validation errors for BadRequestException instances.
     * @param {HttpException} exception - The exception to handle.
     * @param {Request} request - The current request object.
     * @param {Response} response - The current response object.
     * @returns {boolean} True if a validation error was handled, false otherwise.
     */
    private static handleValidationError(
        exception: HttpException,
        request: Request,
        response: Response
    ): boolean {
        if (exception instanceof BadRequestException) {
            const exceptionResponse = exception.getResponse() as ValidationExceptionResponse;
            if (
                exceptionResponse &&
                typeof exceptionResponse === 'object' &&
                ('errors' in exceptionResponse || 'message' in exceptionResponse)
            ) {
                // This is a validation error with details
                const errorResponse = {
                    detail:
                        (exceptionResponse as { detail?: string }).detail || 'Validation failed',
                    instance: request.url,
                    type: '/probs/ValidationError',
                    title: 'Validation error',
                    status: HttpStatus.BAD_REQUEST,
                    errors: exceptionResponse.errors || exceptionResponse.message,
                };

                response.status(HttpStatus.BAD_REQUEST).json(errorResponse);
                return true;
            }
        }
        return false;
    }

    /**
     * Gets the error payload to be sent to the client in the response.
     * @param {HttpException} exception - The exception to handle.
     * @param {string} path - The URL path of the current request.
     * @returns {object} An object containing the error payload.
     */
    getErrorPayload(exception: HttpException, path: string) {
        let response = this.exceptionTemplates[exception.getStatus().toString()];

        // Default to internal server error.
        if (!response) {
            response = this.exceptionTemplates[HttpStatus.INTERNAL_SERVER_ERROR];
        }

        const errorResponse = {
            detail: exception.message,
            instance: path,
            ...response,
        };

        return errorResponse;
    }
}
