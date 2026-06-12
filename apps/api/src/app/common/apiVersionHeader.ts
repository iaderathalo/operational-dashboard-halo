import { NextFunction, Request, RequestHandler, Response } from 'express';

export const X_API_VERSION = 'X-Api-Version';

/**
 * Sets `x-api-version` headers to response with current build version.
 * @param {string} buildVersion - the build version to pass in the response.
 * @returns {RequestHandler} Appends additional header the to current response.
 */
export default function apiVersionHeader(buildVersion: string): RequestHandler {
    return (request: Request, response: Response, next: NextFunction) => {
        response.set(X_API_VERSION, buildVersion);
        next();
    };
}
