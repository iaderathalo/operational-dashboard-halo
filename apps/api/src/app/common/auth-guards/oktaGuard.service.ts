import fs from 'fs';
import https from 'node:https';
import { join } from 'path';

import {
    Logger as PolarisLogger,
    SiemEventName,
    asyncLocalStorage as PolarisLoggerStorage,
} from '@mmctech-artifactory/polaris-logger';
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import OktaJwtVerifier from '@okta/jwt-verifier';

import {
    ApplicationComponent,
    AuthenticationChannel,
    IdentityProvider,
} from '@operational-dashboard/shared-api-model/constants/siem-logging';
import LOCAL_DEVELOPMENT_USER from '@operational-dashboard/shared-api-model/model/common/LocalDevelopmentUser';

import { isWhiteListedController } from '../allowControllerWithNoBearer';

@Injectable()
export default class OktaGuard implements CanActivate {
    oktaJwtVerifier: OktaJwtVerifier;

    organization: string;

    clientId: string;

    audience: string;

    /**
     * @param {ConfigService} configService - instance of configuration service
     * @param {PolarisLogger} logger - Logger service to log to stdout
     * @param {Reflector} reflector - Reflection function from NestJS
     */
    constructor(
        configService: ConfigService,
        private logger: PolarisLogger,
        private reflector: Reflector
    ) {
        this.getConfig(configService);
    }

    /**
     * Asynchronously determines whether the request is authorized to access the route or resource.
     * @param {ExecutionContext} context - The context containing the request and response objects.
     * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating whether the request is authorized.
     */
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        if (process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === 'true') {
            request.user = {
                email: LOCAL_DEVELOPMENT_USER.email,
                name: LOCAL_DEVELOPMENT_USER.name,
                initials: LOCAL_DEVELOPMENT_USER.initials,
                role: LOCAL_DEVELOPMENT_USER.role,
            };
            return true;
        }

        const AUTH_HEADER_PREFIX = 'BEARER';

        return new Promise<boolean>((resolve, reject) => {
            let token: string;
            try {
                this.logger.info('Authentication started');

                // This method checks the context of the request and resolves if AllowControllerWithNoBearer
                // decorator is used on that controller or specific route handler.
                if (isWhiteListedController(context, this.reflector)) {
                    resolve(true);
                    return;
                }

                token = this.getAuthToken(context, AUTH_HEADER_PREFIX);

                this.validateOktaToken(token, request, resolve, reject);
            } catch (error) {
                this.logger.siem(SiemEventName.LOGIN_FAILURE, {
                    msg: 'Authentication with the API failed.',
                    context: `Okta SSO via [${this.audience}].`,
                    applicationComponent: ApplicationComponent.OKTA_GUARD,
                    identityProvider: IdentityProvider.OKTA,
                    authenticationChannel: AuthenticationChannel.SSO,
                });
                this.logger.error('Authentication Failed', { error });
                if (error.message) {
                    reject(new UnauthorizedException(error.message));
                }
                reject(new UnauthorizedException());
            }
        });
    }

    /**
     * Validates an Okta access token using the Okta JWT verifier.
     * @param {string} token - The Okta access token to validate.
     * @param request
     * @param {(value: boolean | PromiseLike<boolean>) => void} resolve - The function to call when the token is successfully validated.
     * @param {(reason) => void} reject - The function to call when there is an error validating the token.
     */
    private validateOktaToken(
        token: string,
        request: Record<string, unknown>,
        resolve: (value: boolean | PromiseLike<boolean>) => void,
        reject: (reason?) => void
    ) {
        this.oktaJwtVerifier
            .verifyAccessToken(token, this.audience)
            .then((oktaResponse: OktaJwtVerifier.Jwt) => {
                this.logger.info(
                    `Successfully verified user [${oktaResponse.claims.employee_id}] with following Email ID - [${oktaResponse.claims.email}]`,
                    {
                        ad_user_name: oktaResponse.claims?.ad_user_name,
                        okta_user_id: oktaResponse.claims?.okta_user_id,
                        employee_id: oktaResponse.claims?.employee_id,
                        app_name: oktaResponse.claims?.app_name,
                    }
                );
                // Add the Actor Name so that all subsequent logs include the authenticated user's identity.
                // The SIEM specification dictates that the `sub` field be used.
                const actorName = oktaResponse.claims.sub;
                PolarisLoggerStorage.getStore().ActorName = actorName;

                request.user = {
                    email: oktaResponse.claims.email,
                    employeeId: oktaResponse.claims.employee_id,
                    name: oktaResponse.claims.name || oktaResponse.claims.sub,
                    adUserName: oktaResponse.claims.ad_user_name,
                    oktaUserId: oktaResponse.claims.okta_user_id,
                };

                this.logger.siem(SiemEventName.LOGIN_SUCCESSFUL, {
                    msg: 'Authentication with the API was successful.',
                    context: `Okta SSO via [${this.audience}] for user [${actorName}].`,
                    applicationComponent: ApplicationComponent.OKTA_GUARD,
                    identityProvider: IdentityProvider.OKTA,
                    authenticationChannel: AuthenticationChannel.SSO,
                });
                resolve(true);
            })
            .catch((error) => {
                this.logger.error('There was an error validating a token', { error });
                if (error.message) {
                    reject(new UnauthorizedException(error.message));
                }

                reject(new UnauthorizedException('Authentication failed'));
            });
    }

    /**
     * Retrieves the authorization token from the request headers.
     * @param {ExecutionContext} context - The context containing the request and response objects.
     * @param {string} AUTH_HEADER_PREFIX - The prefix for the authorization header (e.g. "BEARER").
     * @returns {string} - The authorization token.
     * @throws {UnauthorizedException} - If the authorization header is missing or invalid.
     */
    private getAuthToken(context: ExecutionContext, AUTH_HEADER_PREFIX: string) {
        try {
            const token = context
                .getArgs()[0]
                .headers?.authorization.slice(AUTH_HEADER_PREFIX.length)
                .trim();
            return token;
        } catch (error) {
            this.logger.error('Failed retrieving token from headers', { error });
            throw new UnauthorizedException('Missing or invalid authentication header');
        }
    }

    /**
     * Loads the necessary configuration values from the config service.
     * @param {ConfigService<Record<string, unknown>, false>} configService - The config service providing the necessary configuration values.
     */
    private getConfig(configService: ConfigService<Record<string, unknown>>) {
        this.organization = configService.get<string>('APIGEE_ORGANIZATION');
        this.clientId = configService.get<string>('APIGEE_CLIENT_ID');
        this.audience = `https://${this.organization}-ingress.mgti.mmc.com`;
        this.oktaJwtVerifier = new OktaJwtVerifier({
            issuer: `${this.audience}/authentication/v1`,
            clientId: this.clientId,
            requestAgent: new https.Agent({
                cert: fs.readFileSync(
                    join(__dirname, 'assets', 'tls-local', 'access-management', 'cert.pem'),
                    'utf-8'
                ),
            }),
        });
    }
}
