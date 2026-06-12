import { Module } from '@nestjs/common';

import LivenessIndicator from './liveness-indicator';

@Module({
    providers: [LivenessIndicator],
    exports: [LivenessIndicator],
})
export default class HealthIndicatorsModule {}
