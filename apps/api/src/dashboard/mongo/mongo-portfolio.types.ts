import { ObjectId } from 'mongodb';

import { Application } from '@operational-dashboard/shared-api-model/model/dashboard';

export type MongoDbId = Record<'_id', ObjectId | string>;

export type StoredApplication = Application &
    MongoDbId & {
        opCo?: string | null;
        businessDeliveryPortfolio?: string | null;
        itOwnerEmail?: string | null;
        portfolioOwnerEmail?: string | null;
        portfolioOwnerName?: string | null;
        itOwner?: string | null;
        internalUserCount?: number;
        externalUserCount?: number;
        businessOwner?: string | null;
        businessOwnerEmail?: string | null;
        technicalContact?: string | null;
        technicalContactEmail?: string | null;
        podName?: string | null;
        podLead?: string | null;
        podLeadEmail?: string | null;
        amsServiceStatusMaintenance?: string | null;
        amsServiceStatusApplicationEngineering?: string | null;
        amsServiceStatusApplicationSupport?: string | null;
        amsServiceStatusDatabaseServices?: string | null;
        amsServiceStatusItControls?: string | null;
    };
