import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Disable client-side caching if the router hasn't set cache control.
 * @param {Request} _request - The incoming request object
 * @param {Response} response - The response object that the middleware will set the headers on
 * @param {NextFunction} next - The next middleware function in the chain
 */
const cacheControlHeaders = (_request: Request, response: Response, next: NextFunction) => {
    next();

    // The check on !response.headersSent and the error catch are very important.
    // The server can hang on an error in middleware.
    try {
        if (!response.getHeader('Cache-Control') && !response.headersSent) {
            response.setHeader('Surrogate-Control', 'no-store');
            response.setHeader(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, proxy-revalidate'
            );
            response.setHeader('Pragma', 'no-cache');
            response.setHeader('Expires', '0');
        }
    } catch (err) {
        Logger.error(err);
    }
};

export default cacheControlHeaders;
