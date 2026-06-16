import { Logger } from '@mmctech-artifactory/polaris-logger';
import { ConfigService } from '@nestjs/config';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

import MongoApplicationRepository from './mongo-application.repository';

describe('MongoApplicationRepository', () => {
    const repository = new MongoApplicationRepository(
        { get: jest.fn() } as unknown as ConfigService,
        {} as Logger
    );

    it('should combine search and ownerEmail filters with an $and query', async () => {
        const toArray = jest.fn().mockResolvedValue([]);
        const find = jest.fn().mockReturnValue({ toArray });
        const getCollectionSpy = jest.spyOn(repository, 'getCollection').mockResolvedValue({
            find,
        } as never);

        await repository.findByFilters({
            ownerEmail: 'owner@example.com',
            search: 'alpha',
        });

        expect(getCollectionSpy).toHaveBeenCalledWith('applications');
        expect(find).toHaveBeenCalledWith({
            $and: [
                {
                    $or: [
                        { name: { $regex: 'alpha', $options: 'i' } },
                        { shortCode: { $regex: 'alpha', $options: 'i' } },
                        { description: { $regex: 'alpha', $options: 'i' } },
                    ],
                },
                {
                    $or: [
                        { itOwnerEmail: { $regex: '^owner@example.com$', $options: 'i' } },
                        {
                            portfolioOwnerEmail: {
                                $regex: '^owner@example.com$',
                                $options: 'i',
                            },
                        },
                    ],
                },
            ],
        });
        expect(toArray).toHaveBeenCalledTimes(1);
    });

    it('should map mongo ids without mutating the original document', async () => {
        const source = {
            _id: '507f1f77bcf86cd799439011',
            name: 'Sample App',
            shortCode: 'SAMP',
        } as Application & { _id: string };
        const toArray = jest.fn().mockResolvedValue([source]);
        const find = jest.fn().mockReturnValue({ toArray });

        jest.spyOn(repository, 'getCollection').mockResolvedValue({ find } as never);

        const result = await repository.findAll();

        expect(result).toEqual([
            {
                id: '507f1f77bcf86cd799439011',
                name: 'Sample App',
                shortCode: 'SAMP',
            },
        ]);
        expect(source).toEqual({
            _id: '507f1f77bcf86cd799439011',
            name: 'Sample App',
            shortCode: 'SAMP',
        });
    });
});
