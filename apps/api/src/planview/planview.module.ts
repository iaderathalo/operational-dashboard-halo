import { Module } from '@nestjs/common';

import DremioPortfolioClient from './dremio-portfolio-client';
import PlanviewSyncController from './planview-sync.controller';
import PlanviewSyncService from './planview-sync.service';

@Module({
    controllers: [PlanviewSyncController],
    providers: [DremioPortfolioClient, PlanviewSyncService],
    exports: [PlanviewSyncService],
})
export default class PlanviewModule {}
