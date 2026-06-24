import { Injectable } from '@nestjs/common';

import { RecommendationResult } from '@operational-dashboard/shared-api-model/model/dashboard';

import { RecommendationLlmClient } from './recommendation-llm-client';

/**
 * Drop-in seam for a real LLM provider. When a provider lands, this single class
 * builds a prompt from {@link RecommendationFacts}, calls the gateway, parses the
 * JSON, then runs the SAME validate/repair pass the mock is held to (retry once,
 * then throw). Until then it is a hard stub so an accidental flag flip fails loud
 * rather than serving ungrounded output. No other file changes are needed to swap.
 */
@Injectable()
export default class RealLlmClient implements RecommendationLlmClient {
    /** The error surfaced until a real provider implementation is dropped in. */
    private readonly notWiredMessage =
        'RECOMMENDATIONS_LLM_PROVIDER is set but no real provider is wired yet';

    /**
     * Generates recommendations via the configured real provider.
     * @returns {Promise<RecommendationResult>} never resolves until a provider is wired
     */
    async generate(): Promise<RecommendationResult> {
        throw new Error(this.notWiredMessage);
    }
}
