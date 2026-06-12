import { NextFunction, Request, Response } from 'express';
import { mock } from 'jest-mock-extended';

import cacheControlHeaders from './cacheControlHeaders';

/**
 * Sets the cache control headers to the response and checks if next method is invoked
 * @param {Response} response  the response body to add the headers too.
 */
function checkHeaders(response: Response) {
    const next: NextFunction = jest.fn();
    const request = mock<Request>();

    cacheControlHeaders(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
}

describe('Cache control headers', () => {
    it('should be set by default', () => {
        const response = mock<Response>({ headersSent: false });

        checkHeaders(response);

        expect(response.setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
        expect(response.setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
        expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
        expect(response.setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    it('should not overwrite set cache control', () => {
        const response = mock<Response>({ headersSent: false });
        response.getHeader.mockReturnValueOnce('a value');

        checkHeaders(response);

        expect(response.setHeader).toHaveBeenCalledTimes(0);
    });

    it('should not set headers is headersSent is true', () => {
        const response = mock<Response>({ headersSent: true });

        checkHeaders(response);

        expect(response.setHeader).toHaveBeenCalledTimes(0);
    });

    it('should handle an error being thrown', () => {
        const response = mock<Response>({ headersSent: false });
        response.getHeader.mockImplementation(() => {
            throw new Error();
        });

        checkHeaders(response);

        expect(response.setHeader).toHaveBeenCalledTimes(0);
    });
});
