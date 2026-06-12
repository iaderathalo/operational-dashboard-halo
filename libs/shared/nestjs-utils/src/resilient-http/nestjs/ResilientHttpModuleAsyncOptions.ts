/* eslint-disable @typescript-eslint/no-explicit-any */
import { ModuleMetadata, Provider, Type } from '@nestjs/common';

import ResilientHttpModuleOptions from './ResilientHttpModuleOptions';
import ResilientHttpModuleOptionsFactory from './ResilientHttpModuleOptionsFactory';

export default interface HttpModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useExisting?: Type<ResilientHttpModuleOptionsFactory>;
    useClass?: Type<ResilientHttpModuleOptionsFactory>;
    useFactory?: (
        ...args: any[]
    ) => Promise<ResilientHttpModuleOptions> | ResilientHttpModuleOptions;
    inject?: any[];
    extraProviders?: Provider[];
}
