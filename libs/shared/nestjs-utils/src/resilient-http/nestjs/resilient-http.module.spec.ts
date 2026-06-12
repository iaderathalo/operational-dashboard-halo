import { ClassProvider, DynamicModule, FactoryProvider, Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios, {
    AxiosInstance,
    AxiosInterceptorManager,
    AxiosRequestConfig,
    AxiosResponse,
    InternalAxiosRequestConfig,
} from 'axios';
import { mock } from 'jest-mock-extended';

import ResilientHttpModuleAsyncOptions from './ResilientHttpModuleAsyncOptions';
import ResilientHttpModuleOptions from './ResilientHttpModuleOptions';
import ResilientHttpModuleOptionsFactory from './ResilientHttpModuleOptionsFactory';
import {
    AXIOS_INSTANCE_TOKEN,
    RESILIENT_HTTP_CONFIG,
    RESILIENT_HTTP_MODULE_OPTIONS,
} from './resilient-http.constants';
import ResilientHttpModule from './resilient-http.module';
import ResilientHttpService from './resilient-http.service';
import ResilientHttpConfig from '../axios/ResilientHttpConfig';

jest.mock('axios');

const mockAxios = axios as jest.Mocked<typeof axios>;

/**
 * Creates a mock Axios instance for us with testing. This includes
 * mocking of the interceptors on the instance.
 * @returns {jest.Mocked<AxiosInstance>} The mock Axios instance.
 */
function createMockAxiosInstance(): jest.Mocked<AxiosInstance> {
    const mockAxiosInstance = mock<AxiosInstance>();
    mockAxiosInstance.interceptors = {
        request: mock<AxiosInterceptorManager<InternalAxiosRequestConfig>>(),
        response: mock<AxiosInterceptorManager<AxiosResponse<unknown>>>(),
    };
    return mockAxiosInstance;
}

test('creating the module in a non-dynamic way works as expected', async () => {
    const module: TestingModule = await Test.createTestingModule({
        imports: [ResilientHttpModule],
    }).compile();

    const resilientHttpModule = module.get<ResilientHttpModule>(ResilientHttpModule);
    const resilientHttpService = module.get<ResilientHttpService>(ResilientHttpService);
    const axiosInstance = module.get<AxiosInstance>(AXIOS_INSTANCE_TOKEN);

    expect(resilientHttpModule).toBeDefined();
    expect(resilientHttpService).toBeDefined();
    expect(axiosInstance).toBeDefined();
    expect(resilientHttpService.axiosRef).toEqual(axiosInstance);
});

test('register returns providers based upon the ResilientHttpModuleOptions provided', () => {
    const options: ResilientHttpModuleOptions = {
        axiosConfig: mock<AxiosRequestConfig>(),
        resilientHttpConfig: mock<ResilientHttpConfig>(),
    };
    const mockAxiosInstance = createMockAxiosInstance();
    mockAxios.create.mockReturnValueOnce(mockAxiosInstance);

    const dynamicModule: DynamicModule = ResilientHttpModule.register(options);

    expect(mockAxios.create).toHaveBeenCalledTimes(1);
    expect(mockAxios.create).toHaveBeenCalledWith(options.axiosConfig);
    expect(JSON.stringify(dynamicModule)).toEqual(
        JSON.stringify({
            module: ResilientHttpModule,
            providers: [
                {
                    provide: AXIOS_INSTANCE_TOKEN,
                    useValue: mockAxiosInstance,
                },
                {
                    provide: RESILIENT_HTTP_CONFIG,
                    useFactory: () => mockAxiosInstance,
                },
            ],
        })
    );
});

test('registerAsync returns providers correctly when useFactory is populated in the ResilientHttpModuleAsyncOptions', () => {
    const mockResilientHttpModuleOptions = mock<ResilientHttpModuleOptions>();
    const mockAsyncOptions: ResilientHttpModuleAsyncOptions = {
        useFactory: () => mockResilientHttpModuleOptions,
    };

    const mockAxiosInstance = createMockAxiosInstance();
    mockAxios.create.mockReturnValueOnce(mockAxiosInstance);

    const useFactorySpy = jest.spyOn(mockAsyncOptions, 'useFactory');

    const dynamicModule: DynamicModule = ResilientHttpModule.registerAsync(mockAsyncOptions);

    // Manually perform assertions against each property in the returned dynamic module.
    // This is required due a Jest error of "serializes to the same string" which is assumed to
    // be caused by the functions within the provider objects that are returned.
    expect(dynamicModule.module).toEqual(ResilientHttpModule);
    expect(dynamicModule.imports).toBeUndefined();
    expect(dynamicModule.providers).toHaveLength(3);

    // Overcome ESLint issues with it not recognizing 'provider' as a valid property.
    const moduleProviders = dynamicModule.providers as Array<FactoryProvider>;

    expect(moduleProviders[0].provide).toEqual(RESILIENT_HTTP_MODULE_OPTIONS);
    expect(moduleProviders[0].inject).toHaveLength(0);
    expect(useFactorySpy).toHaveBeenCalledTimes(0);
    moduleProviders[0].useFactory();
    expect(useFactorySpy).toHaveBeenCalledTimes(1);

    expect(moduleProviders[1].provide).toEqual(AXIOS_INSTANCE_TOKEN);
    expect(moduleProviders[1].inject).toContain(RESILIENT_HTTP_MODULE_OPTIONS);
    const axiosProviderUseFactoryResult = moduleProviders[1].useFactory(
        mockResilientHttpModuleOptions
    );
    expect(axiosProviderUseFactoryResult).toEqual(mockAxiosInstance);
    expect(mockAxios.create).toHaveBeenCalledWith(mockResilientHttpModuleOptions.axiosConfig);

    expect(moduleProviders[2].provide).toEqual(RESILIENT_HTTP_CONFIG);
    expect(moduleProviders[2].inject).toContain(RESILIENT_HTTP_MODULE_OPTIONS);
    const resilientHttpConfigProviderUseFactoryResult = moduleProviders[2].useFactory(
        mockResilientHttpModuleOptions
    );
    expect(resilientHttpConfigProviderUseFactoryResult).toEqual(
        mockResilientHttpModuleOptions.resilientHttpConfig
    );

    moduleProviders.forEach((provider) => {
        expect(provider).toHaveProperty('useFactory');
    });
});

test('registerAsync returns providers correctly when useClass is populated in the ResilientHttpModuleAsyncOptions', () => {
    const mockResilientHttpModuleOptionsFactory = mock<Type<ResilientHttpModuleOptionsFactory>>();
    const mockAsyncOptions: ResilientHttpModuleAsyncOptions = {
        useClass: mockResilientHttpModuleOptionsFactory,
    };

    const dynamicModule: DynamicModule = ResilientHttpModule.registerAsync(mockAsyncOptions);

    // Manually perform assertions against each property in the returned dynamic module.
    // This is required due a Jest error of "serializes to the same string" which is assumed to
    // be caused by the functions within the provider objects that are returned.
    expect(dynamicModule.module).toEqual(ResilientHttpModule);
    expect(dynamicModule.imports).toBeUndefined();
    expect(dynamicModule.providers).toHaveLength(4);

    // Casting is required to overcome ESLint issues with it not recognizing properties as being
    // valid when using the generic 'Provider' type.
    expect((dynamicModule.providers[0] as FactoryProvider).provide).toEqual(
        RESILIENT_HTTP_MODULE_OPTIONS
    );
    expect((dynamicModule.providers[0] as FactoryProvider).inject).toContain(
        mockResilientHttpModuleOptionsFactory
    );
    expect(dynamicModule.providers[0] as FactoryProvider).toHaveProperty('useFactory');

    expect((dynamicModule.providers[1] as ClassProvider).provide).toEqual(
        mockResilientHttpModuleOptionsFactory
    );
    expect((dynamicModule.providers[1] as ClassProvider).useClass).toEqual(
        mockResilientHttpModuleOptionsFactory
    );

    expect((dynamicModule.providers[2] as FactoryProvider).provide).toEqual(AXIOS_INSTANCE_TOKEN);
    expect((dynamicModule.providers[2] as FactoryProvider).inject).toContain(
        RESILIENT_HTTP_MODULE_OPTIONS
    );
    expect(dynamicModule.providers[2] as FactoryProvider).toHaveProperty('useFactory');

    expect((dynamicModule.providers[3] as FactoryProvider).provide).toEqual(RESILIENT_HTTP_CONFIG);
    expect((dynamicModule.providers[3] as FactoryProvider).inject).toContain(
        RESILIENT_HTTP_MODULE_OPTIONS
    );
    expect(dynamicModule.providers[3] as FactoryProvider).toHaveProperty('useFactory');
});

test('registerAsync returns providers correctly when useExisting is populated in the ResilientHttpModuleAsyncOptions', () => {
    const mockResilientHttpModuleOptionsFactory = mock<Type<ResilientHttpModuleOptionsFactory>>();
    const mockAsyncOptions: ResilientHttpModuleAsyncOptions = {
        useExisting: mockResilientHttpModuleOptionsFactory,
    };

    const dynamicModule: DynamicModule = ResilientHttpModule.registerAsync(mockAsyncOptions);

    // Manually perform assertions against each property in the returned dynamic module.
    // This is required due a Jest error of "serializes to the same string" which is assumed to
    // be caused by the functions within the provider objects that are returned.
    expect(dynamicModule.module).toEqual(ResilientHttpModule);
    expect(dynamicModule.imports).toBeUndefined();
    expect(dynamicModule.providers).toHaveLength(3);

    // Casting is required to overcome ESLint issues with it not recognizing properties as being
    // valid when using the generic 'Provider' type.
    expect((dynamicModule.providers[0] as FactoryProvider).provide).toEqual(
        RESILIENT_HTTP_MODULE_OPTIONS
    );
    expect((dynamicModule.providers[0] as FactoryProvider).inject).toContain(
        mockResilientHttpModuleOptionsFactory
    );
    expect(dynamicModule.providers[0] as FactoryProvider).toHaveProperty('useFactory');

    expect((dynamicModule.providers[1] as FactoryProvider).provide).toEqual(AXIOS_INSTANCE_TOKEN);
    expect((dynamicModule.providers[1] as FactoryProvider).inject).toContain(
        RESILIENT_HTTP_MODULE_OPTIONS
    );
    expect(dynamicModule.providers[1] as FactoryProvider).toHaveProperty('useFactory');

    expect((dynamicModule.providers[2] as FactoryProvider).provide).toEqual(RESILIENT_HTTP_CONFIG);
    expect((dynamicModule.providers[2] as FactoryProvider).inject).toContain(
        RESILIENT_HTTP_MODULE_OPTIONS
    );
    expect(dynamicModule.providers[2] as FactoryProvider).toHaveProperty('useFactory');
});
