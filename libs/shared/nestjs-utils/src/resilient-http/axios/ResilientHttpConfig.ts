import ResilientHttpConfigDefault from './ResilientHttpConfigDefault';
import ResilientHttpConfigOverride from './ResilientHttpConfigOverride';

/**
 * Represents the supported resilient HTTP configuration.
 */
export default interface ResilientHttpConfig {
    /**
     * The default resilient HTTP configuration to use for all requests which
     * do not have an override. When no value is given, a built-in default
     * configuration is used.
     */
    default?: ResilientHttpConfigDefault;

    /**
     * The overrides to use which take precedence over the default configuration.
     * When no value is given, the default configuration is used.
     */
    overrides?: Array<ResilientHttpConfigOverride>;
}
