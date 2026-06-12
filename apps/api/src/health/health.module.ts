import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import HealthIndicatorsModule from './health-indicators/health-indicators.module';
import HealthController from './health.controller';

@Module({
    imports: [TerminusModule, HealthIndicatorsModule],
    controllers: [HealthController],
})
export default class HealthModule {}
