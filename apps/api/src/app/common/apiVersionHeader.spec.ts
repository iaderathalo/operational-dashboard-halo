import { NextFunction, Request, Response } from 'express';
import { mock } from 'jest-mock-extended';

import apiVersionHeader, { X_API_VERSION } from './apiVersionHeader';

test('sets the response header to the given value', () => {
    const buildVersion = 'test version';
    const next: NextFunction = jest.fn();
    const request = mock<Request>();
    const response = mock<Response>();

    apiVersionHeader(buildVersion)(request, response, next);

    expect(response.set).toHaveBeenCalledWith(X_API_VERSION, buildVersion);
    expect(next).toHaveBeenCalledTimes(1);
});
