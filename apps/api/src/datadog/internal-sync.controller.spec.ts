import { Logger } from '@mmctech-artifactory/polaris-logger';
import { CanActivate, ConflictException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';

import DatadogSyncService from './datadog-sync.service';
import InternalSyncController from './internal-sync.controller';
import InternalSyncGuard from './internal-sync.guard';

/** Stub that always allows — replaces InternalSyncGuard in unit tests. */
const allowAllGuard: CanActivate = { canActivate: () => true };

describe('InternalSyncController.syncDatadog', () => {
    let controller: InternalSyncController;
    let datadogSyncService: jest.Mocked<Pick<DatadogSyncService, 'triggerSync'>>;

    beforeEach(async () => {
        datadogSyncService = { triggerSync: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [InternalSyncController],
            providers: [
                { provide: DatadogSyncService, useValue: datadogSyncService },
                { provide: Logger, useValue: mock<Logger>() },
            ],
        })
            .overrideGuard(InternalSyncGuard)
            .useValue(allowAllGuard)
            .compile();

        controller = module.get<InternalSyncController>(InternalSyncController);
    });

    it('returns an accepted body when triggerSync succeeds', () => {
        datadogSyncService.triggerSync.mockReturnValue(undefined);

        const result = controller.syncDatadog();

        expect(result).toEqual({ status: 'accepted' });
    });

    it('delegates to datadogSyncService.triggerSync exactly once', () => {
        datadogSyncService.triggerSync.mockReturnValue(undefined);

        controller.syncDatadog();

        expect(datadogSyncService.triggerSync).toHaveBeenCalledTimes(1);
    });

    it('propagates a ConflictException thrown by triggerSync (409 path)', () => {
        datadogSyncService.triggerSync.mockImplementation(() => {
            throw new ConflictException('A Datadog sync is already in progress');
        });

        expect(() => controller.syncDatadog()).toThrow(ConflictException);
    });

    it('has @HttpCode(202) metadata on the handler', () => {
        // Reflect the decorator metadata that Nest reads to set the HTTP status code
        const statusCode = Reflect.getMetadata(
            '__httpCode__',
            InternalSyncController.prototype.syncDatadog
        );
        expect(statusCode).toBe(HttpStatus.ACCEPTED);
    });
});
