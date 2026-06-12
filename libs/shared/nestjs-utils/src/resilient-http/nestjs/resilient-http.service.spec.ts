import { Logger } from '@mmctech-artifactory/polaris-logger';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosInstance } from 'axios';
import { mock, MockProxy } from 'jest-mock-extended';

import { AXIOS_INSTANCE_TOKEN, RESILIENT_HTTP_CONFIG } from './resilient-http.constants';
import ResilientHttpService from './resilient-http.service';
import ResilientHttpConfig from '../axios/ResilientHttpConfig';
import applyAxiosRetryConfig from '../axios/resilient-http';

let mockAxios: MockProxy<AxiosInstance>;
let mockLogger: MockProxy<Logger>;

const originalResilientHttpServicePrototype = Object.getPrototypeOf(ResilientHttpService);

jest.mock('../axios/resilient-http');

beforeEach(() => {
    mockAxios = mock<AxiosInstance>();
    mockLogger = mock<Logger>();
    Object.setPrototypeOf(ResilientHttpService, originalResilientHttpServicePrototype);
});

afterEach(() => {
    // Ensure the resilient-http mock for applyAxiosRetryConfig is reset after each test.
    jest.resetAllMocks();
});

test('the parent constructor is called with the axios instance provided', async () => {
    const mockParent = jest.fn();
    Object.setPrototypeOf(ResilientHttpService, mockParent);

    const module: TestingModule = await Test.createTestingModule({
        providers: [ResilientHttpService, { provide: AXIOS_INSTANCE_TOKEN, useValue: mockAxios }],
    }).compile();

    module.get<ResilientHttpService>(ResilientHttpService);

    expect(mockParent).toHaveBeenCalledTimes(1);
    expect(mockParent).toHaveBeenCalledWith(mockAxios);
});

test('applyAxiosRetryConfig is called as expected when only the axiosInstance constructor argument is injected', async () => {
    const module: TestingModule = await Test.createTestingModule({
        providers: [ResilientHttpService, { provide: AXIOS_INSTANCE_TOKEN, useValue: mockAxios }],
    }).compile();

    module.get<ResilientHttpService>(ResilientHttpService);

    expect(applyAxiosRetryConfig).toHaveBeenCalledTimes(1);
    expect(applyAxiosRetryConfig).toHaveBeenCalledWith(mockAxios, undefined, undefined);
});

test('applyAxiosRetryConfig is called as expected when all constructor arguments are injected', async () => {
    const mockResilientHttpConfig = mock<ResilientHttpConfig>();

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            ResilientHttpService,
            { provide: AXIOS_INSTANCE_TOKEN, useValue: mockAxios },
            {
                provide: RESILIENT_HTTP_CONFIG,
                useValue: mockResilientHttpConfig,
            },
            { provide: Logger, useValue: mockLogger },
        ],
    }).compile();

    module.get<ResilientHttpService>(ResilientHttpService);

    expect(applyAxiosRetryConfig).toHaveBeenCalledTimes(1);
    expect(applyAxiosRetryConfig).toHaveBeenCalledWith(
        mockAxios,
        mockResilientHttpConfig,
        mockLogger
    );
});
