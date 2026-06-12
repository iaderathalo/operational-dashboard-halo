import { ConfigService } from '@nestjs/config';
import ddTrace from 'dd-trace';
import { MockProxy, mock } from 'jest-mock-extended';

import initTracing from './trace';

describe('Datadog Tracing Initialization', () => {
    let mockConfigService: MockProxy<ConfigService>;

    beforeEach(() => {
        mockConfigService = mock<ConfigService>();
    });
    it('should initialize Datadog tracing with the correct configuration if APM tracing is set to true', () => {
        mockConfigService.get
            .mockReturnValueOnce('true')
            .mockReturnValueOnce('test')
            .mockReturnValueOnce('test')
            .mockReturnValueOnce('test');

        // Mock the dd-trace.init function to check if it's called with the expected configuration
        const initSpy = jest.spyOn(ddTrace, 'init');

        // Call the tracer initialization code
        initTracing.bind(mockConfigService)();

        // Verify that dd-trace.init was called with the expected configuration
        expect(initSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                hostname: expect.any(String),
                env: expect.any(String),
                service: expect.any(String),
                tags: expect.any(Object),
                logInjection: expect.any(Boolean),
            })
        );

        // Clean up the spy
        initSpy.mockRestore();
    });
});
