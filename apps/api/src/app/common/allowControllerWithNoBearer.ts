import { Logger } from '@mmctech-artifactory/polaris-logger';
import { CustomDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const CONTROLLER_METADATA = 'WhitelistedAuthController';

/**
 * The purpose of this decorator, is to whitelist bearer based authentication on a controller or specific route.
 * Sets MetaData to the Handler or class, and this shall be accessed by nestjs reflector
 * Do not use this decorator without understanding its capabilities [Look into Auth Middleware].
 * @see https://docs.nestjs.com/custom-decorators
 * @returns {CustomDecorator<string>} - returns a decorator that can be used by classes to disable auth in that endpoint.
 */
const AllowControllerWithNoBearer = (): CustomDecorator<string> =>
    SetMetadata(CONTROLLER_METADATA, true);

/**
 * Check the endpoint being invoked and if the endpoint itself or the class it belongs to has
 * the whitelist decorator, return true.
 * @param {ExecutionContext} context - Interface describing details about the current request pipeline.
 * @param {Reflector} reflector - Helper class providing Nest reflection capabilities.
 * @returns {boolean} - true when the decorator has been applied to the class or endpoint, false in all other cases.
 */
export function isWhiteListedController(context: ExecutionContext, reflector: Reflector) {
    // getClass - Returns the instance of the controller class which the current handler belongs to.
    // getHandler - Returns a Instance of the handler that will be invoked in the request pipeline.
    // This can be extended further to support role based authorization
    // Read More : https://docs.nestjs.com/fundamentals/execution-context#reflection-and-metadata

    const logger = new Logger('WhitelistDecorator');
    if (
        reflector.get<boolean>(CONTROLLER_METADATA, context.getClass()) ||
        reflector.get<boolean>(CONTROLLER_METADATA, context.getHandler())
    ) {
        logger.info('The request was performed on a whitelisted route', {
            requestURL: context.switchToHttp()?.getRequest()?.url,
        });
        return true;
    }
    return false;
}
export default AllowControllerWithNoBearer;
