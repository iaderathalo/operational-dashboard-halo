import { X_CORRELATION_ID, asyncLocalStorage } from '@mmctech-artifactory/polaris-logger';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

import ResilientHttpModuleAsyncOptions from './ResilientHttpModuleAsyncOptions';
import ResilientHttpModuleOptions from './ResilientHttpModuleOptions';
import ResilientHttpModuleOptionsFactory from './ResilientHttpModuleOptionsFactory';
import {
    AXIOS_INSTANCE_TOKEN,
    RESILIENT_HTTP_CONFIG,
    RESILIENT_HTTP_MODULE_OPTIONS,
} from './resilient-http.constants';
import ResilientHttpService from './resilient-http.service';

@Module({
    providers: [ResilientHttpService, { provide: AXIOS_INSTANCE_TOKEN, useValue: axios }],
    exports: [ResilientHttpService],
})
export default class ResilientHttpModule {
    /**
     * Register the ResilientHttpModule.
     * @param {ResilientHttpModuleOptions} options - ResilientHttpModuleOptions object containing axiosConfig and resilientHttpConfig properties.
     * @returns {DynamicModule} - A dynamic module with providers for AXIOS_INSTANCE_TOKEN and RESILIENT_HTTP_CONFIG.
     */
    static register(options: ResilientHttpModuleOptions): DynamicModule {
        return {
            module: ResilientHttpModule,
            providers: [
                {
                    provide: AXIOS_INSTANCE_TOKEN,
                    useValue: this.addCorrelationIdInterceptor(axios.create(options.axiosConfig)),
                },
                {
                    provide: RESILIENT_HTTP_CONFIG,
                    useFactory: () =>
                        this.addCorrelationIdInterceptor(axios.create(options.axiosConfig)),
                },
            ],
        };
    }

    /**
     * Register the ResilientHttpModule asynchronously.
     * @param {ResilientHttpModuleAsyncOptions} asyncOptions - ResilientHttpModuleAsyncOptions object containing properties related to async loading of the module.
     * @returns {DynamicModule} - A dynamic module with imported modules, providers and extra providers.
     */
    static registerAsync(asyncOptions: ResilientHttpModuleAsyncOptions): DynamicModule {
        return {
            module: ResilientHttpModule,
            imports: asyncOptions.imports,
            providers: [
                ...this.createAsyncProviders(asyncOptions),
                {
                    provide: AXIOS_INSTANCE_TOKEN,
                    useFactory: (options: ResilientHttpModuleOptions) =>
                        axios.create(options.axiosConfig),
                    inject: [RESILIENT_HTTP_MODULE_OPTIONS],
                },
                {
                    provide: RESILIENT_HTTP_CONFIG,
                    useFactory: (options: ResilientHttpModuleOptions) =>
                        options.resilientHttpConfig,
                    inject: [RESILIENT_HTTP_MODULE_OPTIONS],
                },
                ...(asyncOptions.extraProviders || []),
            ],
        };
    }

    /**
     * Adds an interceptor to the provided Axios instance which adds the
     * 'x-correlation-id' header to outbound requests when available. It pulls
     * this correlation ID from the async local storage of the Polaris Logger.
     * Where there is no correlation ID in the storage, no header is added.
     * @param {AxiosInstance} axiosInstance - The Axios instance to add the interceptor to.
     * @returns {AxiosInstance} An updated Axios instance which is configured to use the interceptor.
     */
    private static addCorrelationIdInterceptor(axiosInstance): AxiosInstance {
        axiosInstance.interceptors.request.use((config) => {
            const activeCorrelationId = asyncLocalStorage.getStore()?.CorrelationID;
            if (config.headers[X_CORRELATION_ID] || !activeCorrelationId) {
                return config;
            }
            return {
                ...config,
                headers: {
                    ...config.headers,
                    [X_CORRELATION_ID]: activeCorrelationId,
                },
            };
        });
        return axiosInstance;
    }

    /**
     * Creates the providers for the async options.
     * @param {ResilientHttpModuleAsyncOptions} options - The async options for the module.
     * @returns {Provider[]} An array of providers.
     */
    private static createAsyncProviders(options: ResilientHttpModuleAsyncOptions): Provider[] {
        if (options.useExisting || options.useFactory) {
            return [this.createAsyncOptionsProvider(options)];
        }
        return [
            this.createAsyncOptionsProvider(options),
            {
                provide: options.useClass,
                useClass: options.useClass,
            },
        ];
    }

    /**
     * Creates the async options provider.
     * @param {ResilientHttpModuleAsyncOptions} options - The async options for the module.
     * @returns {Provider} A provider for the async options.
     */
    private static createAsyncOptionsProvider(options: ResilientHttpModuleAsyncOptions): Provider {
        if (options.useFactory) {
            return {
                provide: RESILIENT_HTTP_MODULE_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject || [],
            };
        }
        return {
            provide: RESILIENT_HTTP_MODULE_OPTIONS,
            useFactory: async (optionsFactory: ResilientHttpModuleOptionsFactory) =>
                optionsFactory.createResilientHttpOptions(),
            inject: [options.useExisting || options.useClass],
        };
    }
}
