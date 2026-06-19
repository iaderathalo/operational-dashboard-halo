import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mock } from 'jest-mock-extended';

import InternalSyncGuard from './internal-sync.guard';

const contextWith = (authorization?: string): ExecutionContext =>
    ({
        switchToHttp: () => ({
            getRequest: () => ({ headers: authorization ? { authorization } : {} }),
        }),
    }) as unknown as ExecutionContext;

const makeGuard = (token?: string): InternalSyncGuard => {
    const configService = mock<ConfigService>();
    (configService.get as jest.Mock).mockReturnValue(token);
    return new InternalSyncGuard(configService, mock<Logger>());
};

describe('InternalSyncGuard', () => {
    it('allows a request carrying the correct token', () => {
        expect(makeGuard('s3cret').canActivate(contextWith('s3cret'))).toBe(true);
    });

    it('accepts a Bearer-prefixed token', () => {
        expect(makeGuard('s3cret').canActivate(contextWith('Bearer s3cret'))).toBe(true);
    });

    it('rejects a wrong token', () => {
        expect(() => makeGuard('s3cret').canActivate(contextWith('nope'))).toThrow(
            UnauthorizedException
        );
    });

    it('rejects a missing Authorization header', () => {
        expect(() => makeGuard('s3cret').canActivate(contextWith())).toThrow(UnauthorizedException);
    });

    it('rejects when INTERNAL_SYNC_TOKEN is not configured', () => {
        expect(() => makeGuard(undefined).canActivate(contextWith('whatever'))).toThrow(
            UnauthorizedException
        );
    });
});
