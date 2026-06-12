import ResilientHttpModuleOptions from './ResilientHttpModuleOptions';

export default interface ResilientHttpModuleOptionsFactory {
    createResilientHttpOptions(): Promise<ResilientHttpModuleOptions> | ResilientHttpModuleOptions;
}
