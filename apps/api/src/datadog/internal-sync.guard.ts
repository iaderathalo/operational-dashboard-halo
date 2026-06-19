import { timingSafeEqual } from 'node:crypto';

import { Logger } from '@mmctech-artifactory/polaris-logger';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Shared-secret guard for internal machine callers (the Crawler). Validates the
 * Authorization header against INTERNAL_SYNC_TOKEN. This is NOT Okta — the internal
 * sync endpoint is exempt from the global OktaGuard via @AllowControllerWithNoBearer.
 */
@Injectable()
export default class InternalSyncGuard implements CanActivate {
    /**
     *
     * @param configService
     * @param logger
     */
    constructor(
        private readonly configService: ConfigService,
        private readonly logger: Logger
    ) {}

    /**
     *
     * @param context
     */
    canActivate(context: ExecutionContext): boolean {
        const expected = this.configService.get<string>('INTERNAL_SYNC_TOKEN');
        if (!expected) {
            this.logger.error(
                'INTERNAL_SYNC_TOKEN is not configured; rejecting internal sync request'
            );
            throw new UnauthorizedException('Internal sync is not configured');
        }

        const request = context.switchToHttp().getRequest();
        const header: string = request?.headers?.authorization ?? '';
        const provided = header.replace(/^Bearer\s+/i, '').trim();

        if (!InternalSyncGuard.tokensMatch(provided, expected)) {
            this.logger.warn('Rejected internal sync request: invalid or missing token');
            throw new UnauthorizedException('Invalid internal sync token');
        }
        return true;
    }

    /**
     * Constant-time token comparison so a byte-by-byte timing attack cannot recover
     * INTERNAL_SYNC_TOKEN. Length mismatch short-circuits (timingSafeEqual requires
     * equal-length buffers).
     * @param {string} provided - token from the request
     * @param {string} expected - configured INTERNAL_SYNC_TOKEN
     * @returns {boolean} true when the tokens match
     */
    private static tokensMatch(provided: string, expected: string): boolean {
        if (!provided || provided.length !== expected.length) {
            return false;
        }
        return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    }
}
